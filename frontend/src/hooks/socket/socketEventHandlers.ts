import { toastr } from '@/lib/toastr';
import type { LiveOverrides, LockedFields, UpdatePayloadData, SummaryTextPayload } from '../useNoteSocket';
import type { Note as NoteType } from '@/types/note';

// 서버에서 받는 updateData 이벤트 타입
export interface UpdateDataPayload {
  noteId: string;
  segmentId?: string;
  sectionId?: string;
  type: 'segment' | 'summary_text' | 'keywords' | 'next_action' | 'main_topic';
  payload: UpdatePayloadData;
  timestamp: number;
  updatedBy: string;
}

// 서버에서 받는 workStatus 이벤트 타입
export interface WorkStatusPayload {
  noteId: string;
  status: 'start' | 'stop' | 'save' | 'error';
  userId: string;
  code?: string;
  message?: string;
  type?: 'segment' | 'summary_text' | 'keywords' | 'next_action' | 'main_topic' | 'speaker_alias';
  segmentId?: string;
  sectionId?: string;
  speakerId?: string;  // speaker_alias 타입에서 사용
  socketId?: string;   // 자신의 세션 구분용 (자신의 lock은 UI에서 제외)
}

// 서버에서 받는 noteData 이벤트 타입
export interface NoteDataPayload {
  segment?: Array<{
    noteId: string;
    segmentId: string;
    type: 'segment';
    payload: string;
    timestamp: number;
    updatedBy: string;
  }>;
  summary_text?: Array<{
    noteId: string;
    sectionId: string;
    type: 'summary_text';
    payload: { title: string; content: string };
    timestamp: number;
    updatedBy: string;
  }>;
  keywords?: {
    noteId: string;
    type: 'keywords';
    payload: string[];
    timestamp: number;
    updatedBy: string;
  };
  next_action?: {
    noteId: string;
    type: 'next_action';
    payload: string;
    timestamp: number;
    updatedBy: string;
  };
  main_topic?: {
    noteId: string;
    type: 'main_topic';
    payload: string;
    timestamp: number;
    updatedBy: string;
  };
  // 임시 화자 목록 (Redis HASH에서 조회, key: speakerId, value: name)
  tempSpeakers?: Record<string, string>;
  // segment별 speaker 변경 (Redis HASH에서 조회, key: segmentId, value: speakerId)
  segmentSpeakers?: Record<string, string>;
  // 병합 대기 중인 화자 (Redis HASH에서 조회, key: sourceId, value: targetId)
  mergedSpeakers?: Record<string, string>;
  // 화자명 변경 대기 (Redis HASH에서 조회, key: speakerId, value: newName)
  aliasedSpeakers?: Record<string, string>;
}

// 서버에서 받는 setSpeakerData 이벤트 타입
export interface SetSpeakerDataPayload {
  noteId: string;
  type: 'add' | 'segment' | 'merge' | 'alias';
  payload: { speakerId: string; name: string } | Record<string, string>;
  segmentId?: string;
  timestamp?: number;
  updatedBy: string;
}

// 재연결 상태 타입
export interface ReconnectState {
  inProgress: boolean;
  tokenRefreshed: boolean;
  tokenRefreshTimeoutId: NodeJS.Timeout | null;
  reconnectAttempts: number;
  reconnectTimeoutId: NodeJS.Timeout | null;
}

/**
 * updateData 이벤트 핸들러 생성
 * 다른 유저가 수정한 데이터를 liveOverrides에 반영
 */
export function createUpdateDataHandler(
  setLiveOverrides: React.Dispatch<React.SetStateAction<LiveOverrides>>
) {
  return (data: UpdateDataPayload) => {
    setLiveOverrides(prev => {
      const newSegments = new Map(prev.segments);
      const newSections = new Map(prev.sections);

      switch (data.type) {
        case 'segment':
          if (data.segmentId) {
            newSegments.set(data.segmentId, data.payload as string);
          }
          break;
        case 'summary_text':
          if (data.sectionId) {
            const sp = data.payload as SummaryTextPayload;
            newSections.set(data.sectionId, {
              title: sp.title,
              content: sp.content,
            });
          }
          break;
        case 'keywords':
          return {
            ...prev,
            segments: newSegments,
            sections: newSections,
            keywords: data.payload as string[],
          };
        case 'next_action':
          return {
            ...prev,
            segments: newSegments,
            sections: newSections,
            next_action: data.payload as string,
          };
        case 'main_topic':
          return {
            ...prev,
            segments: newSegments,
            sections: newSections,
            main_topic: data.payload as string,
          };
      }

      return {
        ...prev,
        segments: newSegments,
        sections: newSections,
      };
    });
  };
}

/**
 * workStatus 이벤트 핸들러 생성
 * 잠금 상태, 저장 성공, 에러 처리
 */
export function createWorkStatusHandler(
  setLockedFields: React.Dispatch<React.SetStateAction<LockedFields>>,
  setLiveOverrides: React.Dispatch<React.SetStateAction<LiveOverrides>>,
  setNote: React.Dispatch<React.SetStateAction<NoteType | null>>,
  attemptReconnect: (refreshTokenFirst: boolean) => void,
  getMySocketId: () => string | undefined
) {
  return (data: WorkStatusPayload) => {
    // 다른 세션의 lock 처리
    if (data.type) {
      // speaker_alias 타입: 자신의 세션이면 무시 (socketId로 구분)
      if (data.type === 'speaker_alias' && data.speakerId) {
        const mySocketId = getMySocketId();
        if (data.socketId === mySocketId) return;  // 자신의 세션이면 lock 처리 무시

        if (data.status === 'start') {
          setLockedFields(prev => ({
            ...prev,
            speakers: new Set(prev.speakers).add(data.speakerId!),
          }));
        } else if (data.status === 'stop') {
          setLockedFields(prev => {
            const newSpeakers = new Set(prev.speakers);
            newSpeakers.delete(data.speakerId!);
            return { ...prev, speakers: newSpeakers };
          });
        }
        return;  // speaker_alias는 여기서 처리 완료
      }

      if (data.status === 'start') {
        // Lock 설정
        setLockedFields(prev => {
          const next = { ...prev };
          switch (data.type) {
            case 'segment':
              if (data.segmentId) {
                next.segments = new Set(prev.segments).add(data.segmentId);
              }
              break;
            case 'summary_text':
              if (data.sectionId) {
                next.sections = new Set(prev.sections).add(data.sectionId);
              }
              break;
            case 'main_topic':
              next.main_topic = true;
              break;
            case 'keywords':
              next.keywords = true;
              break;
            case 'next_action':
              next.next_action = true;
              break;
          }
          return next;
        });
      } else if (data.status === 'stop') {
        // Lock 해제
        setLockedFields(prev => {
          const next = { ...prev };
          switch (data.type) {
            case 'segment':
              if (data.segmentId) {
                const newSet = new Set(prev.segments);
                newSet.delete(data.segmentId);
                next.segments = newSet;
              }
              break;
            case 'summary_text':
              if (data.sectionId) {
                const newSet = new Set(prev.sections);
                newSet.delete(data.sectionId);
                next.sections = newSet;
              }
              break;
            case 'main_topic':
              next.main_topic = false;
              break;
            case 'keywords':
              next.keywords = false;
              break;
            case 'next_action':
              next.next_action = false;
              break;
          }
          return next;
        });
      }
    }

    if (data.status === 'save') {
      // 저장 성공 토스트
      toastr.success('수정 사항이 저장되었습니다.');

      // 저장 성공: liveOverrides 값을 note에 병합
      setLiveOverrides(prev => {
        setNote(prevNote => {
          if (!prevNote) return prevNote;

          // 1. segment text 병합
          let newSegments = prevNote.segments.map(seg => {
            const override = prev.segments.get(String(seg.segment_id));
            return override ? { ...seg, text: override } : seg;
          });

          // 2. segment speaker 병합 (segmentSpeakers → segment.speaker)
          if (prev.segmentSpeakers && prev.segmentSpeakers.size > 0) {
            newSegments = newSegments.map(seg => {
              const newSpeakerId = prev.segmentSpeakers?.get(String(seg.segment_id));
              return newSpeakerId ? { ...seg, speaker: newSpeakerId } : seg;
            });
          }

          // 2-1. 병합된 화자 처리: 모든 segment의 speaker를 mergedSpeakers 매핑에 따라 변경
          // DB에서 sourceId → targetId로 일괄 변경되었으므로, 프론트엔드도 동기화
          if (prev.mergedSpeakers && Object.keys(prev.mergedSpeakers).length > 0) {
            newSegments = newSegments.map(seg => {
              const targetSpeakerId = prev.mergedSpeakers?.[seg.speaker];
              return targetSpeakerId ? { ...seg, speaker: targetSpeakerId } : seg;
            });
          }

          // 3. speakers 병합 (tempSpeakers → note.speakers)
          let newSpeakers = { ...prevNote.speakers };
          if (prev.tempSpeakers && Object.keys(prev.tempSpeakers).length > 0) {
            Object.entries(prev.tempSpeakers).forEach(([speakerId, name]) => {
              newSpeakers[speakerId] = { name };
            });
          }

          // 4. 병합된 화자 처리 (mergedSpeakers: sourceId를 speakers에서 제거)
          if (prev.mergedSpeakers && Object.keys(prev.mergedSpeakers).length > 0) {
            Object.keys(prev.mergedSpeakers).forEach(sourceId => {
              delete newSpeakers[sourceId];
            });
          }

          // 4-1. 화자명 변경 처리 (aliasedSpeakers → speakers[speakerId].name 업데이트)
          if (prev.aliasedSpeakers && Object.keys(prev.aliasedSpeakers).length > 0) {
            Object.entries(prev.aliasedSpeakers).forEach(([speakerId, newName]) => {
              if (newSpeakers[speakerId]) {
                newSpeakers[speakerId] = { name: newName };
              }
            });
          }

          // 5. summary 병합
          let newSummary = prevNote.summary;
          if (newSummary) {
            newSummary = {
              ...newSummary,
              main_topic: prev.main_topic ?? newSummary.main_topic,
              next_actions: prev.next_action ?? newSummary.next_actions,
              keywords: prev.keywords ?? newSummary.keywords,
              sections: newSummary.sections?.map(sec => {
                const override = prev.sections.get(String(sec.order));
                return override ? { ...sec, title: override.title, content: override.content } : sec;
              }),
            };
          }

          return {
            ...prevNote,
            segments: newSegments,
            speakers: newSpeakers,
            summary: newSummary,
          };
        });

        // liveOverrides 정리: 저장 완료된 데이터는 note로 병합되었으므로 제거
        return {
          ...prev,
          tempSpeakers: {},
          segmentSpeakers: new Map(),
          mergedSpeakers: {},
          aliasedSpeakers: {},
        };
      });
    } else if (data.status === 'error') {
      // E4xx 인증 에러: 토큰 갱신 후 재연결
      if (data.code && /^E4\d{3,4}$/.test(data.code)) {
        attemptReconnect(true);
        return;
      }

      // E80200 세션 정리: 현재 토큰으로 바로 재연결
      if (data.code === 'E80200') {
        attemptReconnect(false);
        return;
      }

      // E50201 휴지통(소프트 삭제) 노트: 편집 불가 — 재연결은 무의미하므로 안내만.
      // 서버는 code만 보내고 message는 없어 클라이언트에서 문구를 매핑한다.
      if (data.code === 'E50201') {
        toastr.warning('휴지통에 있는 노트는 편집할 수 없습니다. 복원 후 이용해주세요.');
        return;
      }

      // 일반 에러 토스트
      toastr.warning(data.message || '업데이트에 실패하였습니다.');

      // type이 없으면 liveOverrides 처리 스킵
      if (!data.type) return;

      setLiveOverrides(prev => {
        switch (data.type) {
          case 'segment':
            return { ...prev, segments: new Map() };
          case 'summary_text':
            return { ...prev, sections: new Map() };
          case 'keywords':
            const { keywords, ...restKeywords } = prev;
            return restKeywords;
          case 'next_action':
            const { next_action, ...restNextAction } = prev;
            return restNextAction;
          case 'main_topic':
            const { main_topic, ...restMainTopic } = prev;
            return restMainTopic;
          default:
            return prev;
        }
      });
    }
  };
}

/**
 * noteData 이벤트 핸들러 생성
 * 초기 데이터 동기화 및 재연결 상태 리셋
 */
export function createNoteDataHandler(
  setLiveOverrides: React.Dispatch<React.SetStateAction<LiveOverrides>>,
  reconnectStateRef: React.MutableRefObject<ReconnectState>
) {
  return (data: NoteDataPayload) => {
    // 정상 연결 완료 → 모든 재연결 상태 리셋
    if (reconnectStateRef.current.tokenRefreshTimeoutId) {
      clearTimeout(reconnectStateRef.current.tokenRefreshTimeoutId);
      reconnectStateRef.current.tokenRefreshTimeoutId = null;
    }
    reconnectStateRef.current.tokenRefreshed = false;

    // Backoff 카운터 및 타이머 리셋
    reconnectStateRef.current.reconnectAttempts = 0;
    if (reconnectStateRef.current.reconnectTimeoutId) {
      clearTimeout(reconnectStateRef.current.reconnectTimeoutId);
      reconnectStateRef.current.reconnectTimeoutId = null;
    }

    setLiveOverrides(prev => {
      // 기존 상태를 먼저 복사하고, segments/sections만 새 Map으로 생성
      const newSegments = new Map(prev.segments);
      const newSections = new Map(prev.sections);

      // segment 처리
      if (data.segment && data.segment.length > 0) {
        data.segment.forEach(seg => {
          newSegments.set(seg.segmentId, seg.payload);
        });
      }

      // summary_text (sections) 처리
      if (data.summary_text && data.summary_text.length > 0) {
        data.summary_text.forEach(section => {
          newSections.set(section.sectionId, {
            title: section.payload.title,
            content: section.payload.content,
          });
        });
      }

      // 새 상태 객체 생성 (기존 상태 유지 + 변경된 부분만 덮어쓰기)
      const newOverrides: LiveOverrides = {
        ...prev,
        segments: newSegments,
        sections: newSections,
      };

      // keywords 처리
      if (data.keywords) {
        newOverrides.keywords = data.keywords.payload;
      }

      // next_action 처리
      if (data.next_action) {
        newOverrides.next_action = data.next_action.payload;
      }

      // main_topic 처리
      if (data.main_topic) {
        newOverrides.main_topic = data.main_topic.payload;
      }

      // tempSpeakers 처리 (임시 화자 목록, Record<string, string>)
      if (data.tempSpeakers && Object.keys(data.tempSpeakers).length > 0) {
        newOverrides.tempSpeakers = { ...(prev.tempSpeakers ?? {}), ...data.tempSpeakers };
      }

      // segmentSpeakers 처리 (segment별 speaker 변경, Record<string, string>)
      if (data.segmentSpeakers && Object.keys(data.segmentSpeakers).length > 0) {
        const newSegmentSpeakers = new Map(prev.segmentSpeakers ?? new Map());
        Object.entries(data.segmentSpeakers).forEach(([segmentId, speakerId]) => {
          newSegmentSpeakers.set(segmentId, speakerId);
        });
        newOverrides.segmentSpeakers = newSegmentSpeakers;
      }

      // mergedSpeakers 처리 (병합 대기 중인 화자, Record<string, string>)
      // sourceId → targetId 매핑으로 저장 (segment speaker 표시 시 매핑 적용 용도)
      if (data.mergedSpeakers && Object.keys(data.mergedSpeakers).length > 0) {
        newOverrides.mergedSpeakers = {
          ...(prev.mergedSpeakers ?? {}),
          ...data.mergedSpeakers,
        };
      }

      // aliasedSpeakers 처리 (화자명 변경 대기, Record<string, string>)
      // speakerId → newName 매핑으로 저장 (화자 목록에서 임시 이름 표시 용도)
      if (data.aliasedSpeakers && Object.keys(data.aliasedSpeakers).length > 0) {
        newOverrides.aliasedSpeakers = {
          ...(prev.aliasedSpeakers ?? {}),
          ...data.aliasedSpeakers,
        };
      }

      return newOverrides;
    });
  };
}

/**
 * setSpeakerData 이벤트 핸들러 생성
 * 다른 유저가 추가한 임시 화자 또는 segment speaker 변경을 liveOverrides에 반영
 */
export function createSetSpeakerDataHandler(
  setLiveOverrides: React.Dispatch<React.SetStateAction<LiveOverrides>>
) {
  return (data: SetSpeakerDataPayload) => {
    if (data.type === 'add') {
      // 화자 추가
      setLiveOverrides(prev => {
        const payload = data.payload as { speakerId: string; name: string };
        const { speakerId, name } = payload;
        const currentTempSpeakers = prev.tempSpeakers ?? {};
        // 중복 방지
        if (currentTempSpeakers[speakerId]) {
          return prev;
        }
        return {
          ...prev,
          tempSpeakers: { ...currentTempSpeakers, [speakerId]: name },
        };
      });
    } else if (data.type === 'segment') {
      // segment speaker 변경
      setLiveOverrides(prev => {
        const payload = data.payload as Record<string, string>;
        const newSegmentSpeakers = new Map(prev.segmentSpeakers ?? new Map());
        Object.entries(payload).forEach(([segmentId, speakerId]) => {
          newSegmentSpeakers.set(segmentId, speakerId);
        });
        return {
          ...prev,
          segmentSpeakers: newSegmentSpeakers,
        };
      });
    } else if (data.type === 'merge') {
      // 화자 병합: sourceId -> targetId로 변경
      setLiveOverrides(prev => {
        const mergePayload = data.payload as Record<string, string>;
        // segmentSpeakers에서 sourceId를 targetId로 변경 (이미 변경된 segment만)
        const newSegmentSpeakers = new Map(prev.segmentSpeakers ?? new Map());
        newSegmentSpeakers.forEach((speakerId, segmentId) => {
          if (mergePayload[speakerId]) {
            newSegmentSpeakers.set(segmentId, mergePayload[speakerId]);
          }
        });
        // tempSpeakers에서 sourceId 제거
        const newTempSpeakers = { ...(prev.tempSpeakers ?? {}) };
        Object.keys(mergePayload).forEach(sourceId => {
          delete newTempSpeakers[sourceId];
        });
        // mergedSpeakers에 sourceId → targetId 매핑 추가
        // 연쇄 병합 처리: 기존 mergedSpeakers의 값이 새 병합의 sourceId인 경우 최종 target으로 업데이트
        // 예: 기존 { sp_5: sp_4 } + 새 { sp_4: sp_3 } → { sp_5: sp_3, sp_4: sp_3 }
        const newMergedSpeakers = { ...(prev.mergedSpeakers ?? {}) };
        // 1. 기존 매핑의 값이 새 병합의 source인 경우 최종 target으로 업데이트
        Object.keys(newMergedSpeakers).forEach(existingSource => {
          const existingTarget = newMergedSpeakers[existingSource];
          if (mergePayload[existingTarget]) {
            newMergedSpeakers[existingSource] = mergePayload[existingTarget];
          }
        });
        // 2. 새 병합 매핑 추가
        Object.assign(newMergedSpeakers, mergePayload);
        return {
          ...prev,
          segmentSpeakers: newSegmentSpeakers,
          tempSpeakers: newTempSpeakers,
          mergedSpeakers: newMergedSpeakers,
        };
      });
    } else if (data.type === 'alias') {
      // 화자명 변경: speakerId의 이름을 newName으로 변경
      setLiveOverrides(prev => {
        const aliasPayload = data.payload as Record<string, string>;
        return {
          ...prev,
          aliasedSpeakers: {
            ...(prev.aliasedSpeakers ?? {}),
            ...aliasPayload,
          },
        };
      });
    }
  };
}
