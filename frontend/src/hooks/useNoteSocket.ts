"use client";
import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { Socket } from 'socket.io-client';

/** socket.io-client를 lazy load (페이지 진입 시 즉시 다운로드 방지) */
let socketIoModulePromise: Promise<typeof import('socket.io-client')> | null = null;
function loadSocketIo() {
  if (!socketIoModulePromise) {
    socketIoModulePromise = import('socket.io-client');
  }
  return socketIoModulePromise;
}
import { toast } from 'sonner';
import { getSttEditModuleUrl } from '@/lib/env';
// storage, TOKEN_KEYS import 제거 - HttpOnly 쿠키로 토큰 자동 전송 (XSS 방어)
import type { Note as NoteType } from '@/types/note';
import { useEditableField, FIELD_NAME_MAP } from './useEditableField';
import {
  createUpdateDataHandler,
  createWorkStatusHandler,
  createNoteDataHandler,
  createSetSpeakerDataHandler,
  type ReconnectState,
} from './socket/socketEventHandlers';
import {
  createExecuteReconnect,
  createAttemptReconnect,
  cleanupReconnectTimers,
} from './socket/reconnectLogic';
import {
  createUpdateMainTopicHandler,
  createUpdateNextActionHandler,
  createUpdateKeywordsHandler,
  createUpdateSegmentHandler,
  createUpdateSummaryTextHandler,
} from './socket/updateValidators';
import { createRateLimiter } from './socket/rateLimiter';
import { scheduleAutoSave, startEditTimer } from './socket/editTimers';

// 실시간 오버라이드 데이터 인터페이스
export interface LiveOverrides {
  segments: Map<string, string>;  // segmentId → text
  sections: Map<string, { title: string; content: string }>;  // sectionId → {title, content}
  keywords?: string[];
  next_action?: string;
  main_topic?: string;
  // 스피커 관리
  speakers?: Record<string, { name: string }>;  // speakerId → {name}
  segmentSpeakers?: Map<string, string>;  // segmentId → speakerId
  tempSpeakers?: Record<string, string>;  // 임시 화자 목록 (speakerId → name, Redis HASH)
  mergedSpeakers?: Record<string, string>;  // 병합된 화자 매핑 (sourceId → targetId)
  aliasedSpeakers?: Record<string, string>;  // 화자명 변경 대기 (speakerId → newName, Redis HASH)
}

// Lock 상태 인터페이스
export interface LockedFields {
  segments: Set<string>;    // lock된 segmentId 집합
  sections: Set<string>;    // lock된 sectionId 집합 (summary_text)
  speakers: Set<string>;    // lock된 speakerId 집합 (speaker_alias)
  main_topic: boolean;
  keywords: boolean;
  next_action: boolean;
}

// 타입별 payload 정의
interface SegmentPayload {
  text: string;
}

export interface SummaryTextPayload {
  title: string;
  content: string;
}

interface KeywordsPayload {
  keywords: string[];
}

interface TextPayload {
  text: string;
}

// 모든 payload 타입의 유니온
// string: main_topic, next_action, segment용
// string[]: keywords용
// SummaryTextPayload: summary_text용
export type UpdatePayloadData =
  | string
  | string[]
  | SummaryTextPayload;

// 소켓 통신을 위한 데이터 인터페이스 정의
export interface UpdatePayload {
  noteId: string;
  segmentId?: string;
  sectionId?: string;
  type: 'segment' | 'summary_text' | 'keywords' | 'next_action' | 'main_topic';
  payload: UpdatePayloadData;
  timestamp?: number;
  updatedBy?: string;
  // token 필드 제거 - HttpOnly 쿠키로 자동 전송 (XSS 방어)
}

export interface StatusPayload {
  noteId: string;
  segmentId?: string;
  sectionId?: string;
  type: 'segment' | 'summary_text' | 'keywords' | 'next_action' | 'main_topic';
  status: 'start' | 'stop' | 'save';
  userId: string;
}

// 화자 관리용 payload
export interface SetSpeakerPayload {
  noteId: string;
  type: 'add' | 'segment' | 'merge' | 'alias';
  payload: { speakerId: string; name: string } | Record<string, string>;
  segmentId?: string;
  timestamp?: number;
  updatedBy: string;
}

interface EditingState {
  // Segment
  editingSegmentId: string | null;
  setEditingSegmentId: (id: string | null) => void;
  editingText: string;
  setEditingText: (text: string) => void;
  // Main Topic
  isEditingMainTopic: boolean;
  setIsEditingMainTopic: (value: boolean) => void;
  editingMainTopicText: string;
  setEditingMainTopicText: (text: string) => void;
  // Next Action
  isEditingNextAction: boolean;
  setIsEditingNextAction: (value: boolean) => void;
  editingNextActionText: string;
  setEditingNextActionText: (text: string) => void;
  // Keywords
  isEditingKeywords: boolean;
  setIsEditingKeywords: (value: boolean) => void;
  editingKeywordsText: string;
  setEditingKeywordsText: (text: string) => void;
  // Section
  editingSection: { order: number | null; field: 'title' | 'content' | null };
  setEditingSection: (value: { order: number | null; field: 'title' | 'content' | null }) => void;
  editingSectionText: string;
  setEditingSectionText: (text: string) => void;
}

interface UseNoteSocketProps {
  noteId: string;
  userId: number | undefined;
  note: NoteType | null;
  setNote: React.Dispatch<React.SetStateAction<NoteType | null>>;
  editingState: EditingState;
}

export function useNoteSocket({
  noteId,
  userId,
  note,
  setNote,
  editingState,
}: UseNoteSocketProps) {
  const socketRef = useRef<Socket | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoRevertTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 현재 활성 편집의 finish 핸들러(매 렌더 갱신). 새 필드 편집을 시작할 때
  // 이전 필드를 먼저 종료(저장+stop emit)해 잠금이 고아로 남지 않게 한다.
  // 공유 autoRevertTimerRef가 clearTimers로 취소돼도 잠금 해제가 누락되지 않는다.
  const activeFinishRef = useRef<(() => void) | null>(null);
  const finishActiveEdit = useCallback(() => {
    const f = activeFinishRef.current;
    if (f) f();
  }, []);
  // 편집 시작 시간 기록 (최대 편집 시간 제한용)
  const segmentEditStartTimeRef = useRef<number | null>(null);
  const keywordsEditStartTimeRef = useRef<number | null>(null);
  const sectionEditStartTimeRef = useRef<number | null>(null);

  // 재연결 상태 추적
  const reconnectStateRef = useRef<ReconnectState>({
    inProgress: false,
    tokenRefreshed: false,
    tokenRefreshTimeoutId: null,
    reconnectAttempts: 0,
    reconnectTimeoutId: null,
  });

  // connectSocket 함수 참조를 위한 ref
  const connectSocketRef = useRef<(() => void | Promise<void>) | null>(null);

  // 실시간 오버라이드 데이터 state
  const [liveOverrides, setLiveOverrides] = useState<LiveOverrides>({
    segments: new Map(),
    sections: new Map(),
  });

  // Lock 상태 state
  const [lockedFields, setLockedFields] = useState<LockedFields>({
    segments: new Set(),
    sections: new Set(),
    speakers: new Set(),
    main_topic: false,
    keywords: false,
    next_action: false,
  });

  const {
    editingSegmentId, setEditingSegmentId,
    editingText, setEditingText,
    isEditingMainTopic, setIsEditingMainTopic,
    editingMainTopicText, setEditingMainTopicText,
    isEditingNextAction, setIsEditingNextAction,
    editingNextActionText, setEditingNextActionText,
    isEditingKeywords, setIsEditingKeywords,
    editingKeywordsText, setEditingKeywordsText,
    editingSection, setEditingSection,
    editingSectionText, setEditingSectionText,
  } = editingState;

  // --- 공용 타이머 클리어 함수 ---
  const clearTimers = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (autoRevertTimerRef.current) {
      clearTimeout(autoRevertTimerRef.current);
      autoRevertTimerRef.current = null;
    }
  }, []);

  // --- 재연결 로직 (reconnectLogic.ts에서 가져온 팩토리 함수 사용) ---
  // useMemo로 메모이제이션하여 useEffect 의존성 변경 방지
  const reconnectDeps = useMemo(() => ({ socketRef, reconnectStateRef, connectSocketRef }), []);
  const executeReconnect = useMemo(() => createExecuteReconnect(reconnectDeps), [reconnectDeps]);
  const attemptReconnect = useMemo(() => createAttemptReconnect(reconnectDeps, executeReconnect), [reconnectDeps, executeReconnect]);

  // --- Socket 연결 ---
  useEffect(() => {
    if (!noteId || !userId) return;
    let cancelled = false;

    const connectSocket = async () => {
      // 기존 소켓이 있으면 해제
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      // socket.io-client를 lazy load
      const { io } = await loadSocketIo();
      if (cancelled) return;

      // HttpOnly 쿠키 사용 - 토큰 직접 전달 불필요 (XSS 방어)
      const socket = io(`${getSttEditModuleUrl()}/note`, {
        auth: {
          noteId: noteId,
          // token 제거 - HttpOnly 쿠키로 자동 전송
        },
        withCredentials: true,  // 쿠키 전송 허용 (CORS credentials)
        transports: ['websocket', 'polling'],  // WebSocket 우선, 실패 시 polling fallback
        // secure 하드코딩 제거 — 스킴은 getSttEditModuleUrl()이 페이지 프로토콜에
        //        맞춰 결정한다(https 페이지 → wss). 운영에서 ws:// 평문 전송·mixed-content 차단 방지.
        // socket.io 내장 재연결 비활성화 — 커스텀 백오프(reconnectLogic)와 중복 방지.
        reconnection: false,
      });

      socketRef.current = socket;

      // 이벤트 핸들러 등록 (socketEventHandlers.ts에서 가져온 팩토리 함수 사용)
      socket.on('updateData', createUpdateDataHandler(setLiveOverrides));

      socket.on('workStatus', createWorkStatusHandler(
        setLockedFields,
        setLiveOverrides,
        setNote,
        attemptReconnect,
        () => socketRef.current?.id  // getMySocketId: 현재 소켓의 ID 반환
      ));

      socket.on('noteData', createNoteDataHandler(setLiveOverrides, reconnectStateRef));

      socket.on('setSpeakerData', createSetSpeakerDataHandler(setLiveOverrides));
    };

    // connectSocket 함수를 ref에 저장 (재연결 시 사용)
    connectSocketRef.current = connectSocket;

    // 초기 연결
    connectSocket();

    return () => {
      cancelled = true;
      cleanupReconnectTimers(reconnectStateRef);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [noteId, userId, setNote, attemptReconnect]);

  // --- Rate Limiting (rateLimiter.ts에서 가져온 팩토리 함수 사용) ---
  const requestTimestampsRef = useRef<number[]>([]);
  const checkRateLimitRef = useRef<() => boolean>();
  if (!checkRateLimitRef.current) {
    checkRateLimitRef.current = createRateLimiter(requestTimestampsRef);
  }
  const checkRateLimit = checkRateLimitRef.current;

  // --- 클라이언트 -> 서버 이벤트 발생 함수 ---
  const emitUpdate = useCallback((data: Omit<UpdatePayload, 'noteId' | 'timestamp' | 'updatedBy'>) => {
    // Rate limit 체크
    if (!checkRateLimit()) return;

    // HttpOnly 쿠키로 토큰 자동 전송 - token 필드 제거 (XSS 방어)
    if (socketRef.current && userId) {
      const payload: UpdatePayload = {
        ...data,
        noteId: noteId,
        timestamp: Date.now(),
        updatedBy: String(userId),
      };
      socketRef.current.emit('update', payload);
    }
  }, [noteId, userId, checkRateLimit]);

  const emitStatus = useCallback((data: Omit<StatusPayload, 'noteId' | 'userId'>) => {
    if (socketRef.current && userId) {
      const payload: StatusPayload = {
        ...data,
        noteId: noteId,
        userId: String(userId),
      };
      socketRef.current.emit('status', payload);
    }
  }, [noteId, userId]);

  // 화자 관리 이벤트 발생 함수
  const emitSetSpeaker = useCallback((data: Omit<SetSpeakerPayload, 'noteId' | 'timestamp' | 'updatedBy'>) => {
    if (!checkRateLimit()) return;

    if (socketRef.current && userId) {
      const payload: SetSpeakerPayload = {
        ...data,
        noteId: noteId,
        timestamp: Date.now(),
        updatedBy: String(userId),
      };
      socketRef.current.emit('setSpeaker', payload);
    }
  }, [noteId, userId, checkRateLimit]);

  // segment speaker 변경 이벤트 발생 함수
  const emitSetSegmentSpeaker = useCallback((segmentId: string, speakerId: string) => {
    if (!checkRateLimit()) return;

    if (socketRef.current && userId) {
      const payload: SetSpeakerPayload = {
        noteId: noteId,
        type: 'segment',
        payload: { [segmentId]: speakerId },
        timestamp: Date.now(),
        updatedBy: String(userId),
      };
      socketRef.current.emit('setSpeaker', payload);

      // optimistic update
      setLiveOverrides(prev => {
        const newSegmentSpeakers = new Map(prev.segmentSpeakers ?? new Map());
        newSegmentSpeakers.set(segmentId, speakerId);
        return { ...prev, segmentSpeakers: newSegmentSpeakers };
      });
    }
  }, [noteId, userId, checkRateLimit]);

  // 화자 병합 이벤트 발생 함수
  const emitMergeSpeaker = useCallback((sourceId: string, targetId: string) => {
    if (!checkRateLimit()) return;

    if (socketRef.current && userId) {
      const payload: SetSpeakerPayload = {
        noteId: noteId,
        type: 'merge',
        payload: { [sourceId]: targetId },  // { "sp_4": "sp_3" } 형태
        timestamp: Date.now(),
        updatedBy: String(userId),
      };
      socketRef.current.emit('setSpeaker', payload);
    }
  }, [noteId, userId, checkRateLimit]);

  // 화자명 변경 이벤트 발생 함수
  const emitSetSpeakerAlias = useCallback((speakerId: string, newName: string) => {
    if (!checkRateLimit()) return;

    if (socketRef.current && userId) {
      const payload: SetSpeakerPayload = {
        noteId: noteId,
        type: 'alias',
        payload: { [speakerId]: newName },  // { "sp_1": "동생" } 형태
        timestamp: Date.now(),
        updatedBy: String(userId),
      };
      socketRef.current.emit('setSpeaker', payload);

      // optimistic update: aliasedSpeakers에 저장
      setLiveOverrides(prev => ({
        ...prev,
        aliasedSpeakers: {
          ...(prev.aliasedSpeakers ?? {}),
          [speakerId]: newName,
        },
      }));
    }
  }, [noteId, userId, checkRateLimit]);

  // 화자 편집 lock 상태 전송 함수
  const emitSpeakerStatus = useCallback((speakerId: string, status: 'start' | 'stop') => {
    if (!socketRef.current || !noteId || !userId) return;

    socketRef.current.emit('status', {
      noteId,
      type: 'speaker_alias',
      speakerId,
      status,
      userId: String(userId),
    });
  }, [noteId, userId]);

  // --- 타입별 업데이트 헬퍼 함수 (updateValidators.ts에서 가져온 팩토리 함수 사용) ---
  const handleUpdateMainTopic = createUpdateMainTopicHandler(emitUpdate);
  const handleUpdateNextAction = createUpdateNextActionHandler(emitUpdate);
  const handleUpdateKeywords = createUpdateKeywordsHandler(emitUpdate);
  const handleUpdateSegment = createUpdateSegmentHandler(emitUpdate);
  const handleUpdateSummaryText = createUpdateSummaryTextHandler(emitUpdate);

  // --- Main Topic 편집 (useEditableField 사용) ---
  const mainTopicHandlers = useEditableField<string>({
    fieldType: 'main_topic',
    isLocked: () => lockedFields.main_topic,
    getOriginalValue: () => note?.summary?.main_topic ?? '',
    getLiveOverride: () => liveOverrides.main_topic,
    handleUpdate: handleUpdateMainTopic,
    setLiveOverride: (value) => setLiveOverrides(prev => ({ ...prev, main_topic: value })),
    emitStatus: (status) => emitStatus({ type: 'main_topic', status }),
    setIsEditing: setIsEditingMainTopic,
    setEditingValue: setEditingMainTopicText,
    getEditingValue: () => editingMainTopicText,
    resetEditingValue: () => setEditingMainTopicText(''),
    autoRevertTimerRef,
    clearTimers,
    canEdit: () => !!(note?.summary?.main_topic || liveOverrides.main_topic),
    onBeforeStart: finishActiveEdit,
  });

  // --- Next Action 편집 (useEditableField 사용) ---
  const nextActionHandlers = useEditableField<string>({
    fieldType: 'next_action',
    isLocked: () => lockedFields.next_action,
    getOriginalValue: () => note?.summary?.next_actions ?? '',
    getLiveOverride: () => liveOverrides.next_action,
    handleUpdate: handleUpdateNextAction,
    setLiveOverride: (value) => setLiveOverrides(prev => ({ ...prev, next_action: value })),
    emitStatus: (status) => emitStatus({ type: 'next_action', status }),
    setIsEditing: setIsEditingNextAction,
    setEditingValue: setEditingNextActionText,
    getEditingValue: () => editingNextActionText,
    resetEditingValue: () => setEditingNextActionText(''),
    autoRevertTimerRef,
    clearTimers,
    canEdit: () => !!(note?.summary?.next_actions || liveOverrides.next_action),
    onBeforeStart: finishActiveEdit,
  });

  // --- Segment 인라인 편집 로직 ---
  const handleFinishEditing = useCallback(() => {
    clearTimers();

    if (!editingSegmentId || !note) return;

    // liveOverrides에 있으면 그 값과 비교, 없으면 원본과 비교
    const overrideText = liveOverrides.segments.get(editingSegmentId);
    const originalSegment = note.segments.find(s => String(s.segment_id) === editingSegmentId);
    const compareText = overrideText ?? (originalSegment ? originalSegment.text : '');

    if (compareText !== editingText) {
      const result = handleUpdateSegment(editingSegmentId, editingText);

      // truncated 시 잘린 값을 input에 반영하고 편집 모드 유지
      if (result.truncatedValue !== undefined) {
        setEditingText(result.truncatedValue);
        return; // 편집 모드 유지
      }

      // 전송 성공 시 liveOverrides에 저장
      if (result.sent) {
        setLiveOverrides(prev => {
          const newSegments = new Map(prev.segments);
          newSegments.set(editingSegmentId, editingText);
          return { ...prev, segments: newSegments };
        });
      }
    }

    emitStatus({
      type: 'segment',
      segmentId: editingSegmentId,
      status: 'stop',
    });

    segmentEditStartTimeRef.current = null; // 편집 시작 시간 초기화
    setEditingSegmentId(null);
    setEditingText('');
  }, [editingSegmentId, editingText, note, liveOverrides, emitStatus, handleUpdateSegment, clearTimers, setEditingSegmentId, setEditingText, setLiveOverrides]);

  const handleSegmentDoubleClick = useCallback((segmentId: string, currentText: string) => {
    // Lock 체크
    if (lockedFields.segments.has(segmentId)) {
      toast.info(`${FIELD_NAME_MAP.segment}은(는) 다른 곳에서 수정 중입니다.`);
      return;
    }

    finishActiveEdit(); // 다른 필드 편집 중이면 먼저 종료(잠금 해제)
    clearTimers();
    setEditingSegmentId(segmentId);
    // liveOverrides에 있으면 그 값 사용, 없으면 원본 사용
    const textToEdit = liveOverrides.segments.get(segmentId) ?? currentText;
    setEditingText(textToEdit);
    emitStatus({
      type: 'segment',
      segmentId: segmentId,
      status: 'start',
    });
    startEditTimer(segmentEditStartTimeRef, autoRevertTimerRef, handleFinishEditing);
  }, [lockedFields, liveOverrides, emitStatus, clearTimers, setEditingSegmentId, setEditingText, handleFinishEditing, finishActiveEdit]);

  const handleSegmentTextChange = useCallback((newText: string) => {
    setEditingText(newText);
    clearTimers();
    scheduleAutoSave(segmentEditStartTimeRef, autoRevertTimerRef, handleFinishEditing);
  }, [handleFinishEditing, clearTimers, setEditingText]);

  const handleSegmentKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.ctrlKey) {
      event.preventDefault();
      handleFinishEditing();
    }
  }, [handleFinishEditing]);

  // --- Keywords 인라인 편집 로직 ---
  const handleFinishKeywordsEditing = useCallback(() => {
    clearTimers();

    if (!note?.summary) return;

    const newKeywords = editingKeywordsText.split(',').map(k => k.trim()).filter(k => k);
    // liveOverrides에 있으면 그 값과 비교, 없으면 원본과 비교
    const compareKeywords = liveOverrides.keywords ?? note.summary.keywords ?? [];

    const hasChanged = compareKeywords.length !== newKeywords.length || compareKeywords.some((val, i) => val !== newKeywords[i]);

    if (hasChanged) {
      const result = handleUpdateKeywords(newKeywords);

      // truncated 시 잘린 값을 input에 반영하고 편집 모드 유지
      if (result.truncatedValue !== undefined) {
        setEditingKeywordsText(result.truncatedValue.join(', '));
        return; // 편집 모드 유지
      }

      // 전송 성공 시 liveOverrides에 저장
      if (result.sent) {
        setLiveOverrides(prev => ({
          ...prev,
          keywords: newKeywords,
        }));
      }
    }

    emitStatus({
      type: 'keywords',
      status: 'stop',
    });

    keywordsEditStartTimeRef.current = null; // 편집 시작 시간 초기화
    setIsEditingKeywords(false);
  }, [note, editingKeywordsText, liveOverrides, emitStatus, handleUpdateKeywords, clearTimers, setIsEditingKeywords, setEditingKeywordsText, setLiveOverrides]);

  const handleKeywordsDoubleClick = useCallback(() => {
    finishActiveEdit(); // 다른 필드 편집 중이면 먼저 종료(잠금 해제)
    // Lock 체크
    if (lockedFields.keywords) {
      toast.info(`${FIELD_NAME_MAP.keywords}은(는) 다른 곳에서 수정 중입니다.`);
      return;
    }

    if (!note?.summary?.keywords && !liveOverrides.keywords) return;
    clearTimers();
    setIsEditingKeywords(true);
    // liveOverrides에 있으면 그 값 사용, 없으면 원본 사용
    const keywordsToEdit = liveOverrides.keywords ?? note?.summary?.keywords ?? [];
    setEditingKeywordsText(keywordsToEdit.join(', '));
    emitStatus({
      type: 'keywords',
      status: 'start',
    });
    startEditTimer(keywordsEditStartTimeRef, autoRevertTimerRef, handleFinishKeywordsEditing);
  }, [lockedFields, note, liveOverrides, emitStatus, clearTimers, setIsEditingKeywords, setEditingKeywordsText, handleFinishKeywordsEditing, finishActiveEdit]);

  const handleKeywordsTextChange = useCallback((newText: string) => {
    setEditingKeywordsText(newText);
    clearTimers();
    scheduleAutoSave(keywordsEditStartTimeRef, autoRevertTimerRef, handleFinishKeywordsEditing);
  }, [handleFinishKeywordsEditing, clearTimers, setEditingKeywordsText]);

  // --- Section Summary 인라인 편집 로직 ---
  const handleFinishSectionEditing = useCallback(() => {
    clearTimers();

    if (!editingSection.order || !editingSection.field || !note?.summary?.sections) return;

    const sectionId = String(editingSection.order);
    const originalSection = note.summary.sections.find(s => s.order === editingSection.order);
    if (!originalSection) return;

    // liveOverrides에 있으면 그 값과 비교, 없으면 원본과 비교
    const overrideSection = liveOverrides.sections.get(sectionId);
    const compareTitle = overrideSection?.title ?? originalSection.title;
    const compareContent = overrideSection?.content ?? originalSection.content;
    const compareText = editingSection.field === 'title' ? compareTitle : compareContent;

    const hasChanged = compareText !== editingSectionText;

    if (hasChanged) {
      const newTitle = editingSection.field === 'title' ? editingSectionText : (overrideSection?.title ?? originalSection.title);
      const newContent = editingSection.field === 'content' ? editingSectionText : (overrideSection?.content ?? originalSection.content);
      const result = handleUpdateSummaryText(sectionId, newTitle, newContent);

      // truncated 시 잘린 값을 input에 반영하고 편집 모드 유지
      if (result.truncatedTitle !== undefined || result.truncatedContent !== undefined) {
        if (editingSection.field === 'title' && result.truncatedTitle !== undefined) {
          setEditingSectionText(result.truncatedTitle);
        } else if (editingSection.field === 'content' && result.truncatedContent !== undefined) {
          setEditingSectionText(result.truncatedContent);
        }
        return; // 편집 모드 유지
      }

      // 전송 성공 시 liveOverrides에 저장
      if (result.sent) {
        setLiveOverrides(prev => {
          const newSections = new Map(prev.sections);
          newSections.set(sectionId, { title: newTitle, content: newContent });
          return { ...prev, sections: newSections };
        });
      }
    }

    emitStatus({
      type: 'summary_text',
      sectionId: sectionId,
      status: 'stop',
    });

    sectionEditStartTimeRef.current = null; // 편집 시작 시간 초기화
    setEditingSection({ order: null, field: null });
  }, [note, editingSection, editingSectionText, liveOverrides, emitStatus, handleUpdateSummaryText, clearTimers, setEditingSection, setEditingSectionText, setLiveOverrides]);

  const handleSectionDoubleClick = useCallback((order: number, field: 'title' | 'content', currentText: string) => {
    finishActiveEdit(); // 다른 필드 편집 중이면 먼저 종료(잠금 해제)
    const sectionId = String(order);

    // Lock 체크
    if (lockedFields.sections.has(sectionId)) {
      toast.info(`${FIELD_NAME_MAP.summary_text}은(는) 다른 곳에서 수정 중입니다.`);
      return;
    }

    clearTimers();
    setEditingSection({ order, field });
    // liveOverrides에 있으면 그 값 사용, 없으면 원본 사용
    const overrideSection = liveOverrides.sections.get(sectionId);
    const textToEdit = overrideSection ? overrideSection[field] : currentText;
    setEditingSectionText(textToEdit);
    emitStatus({
      type: 'summary_text',
      sectionId: sectionId,
      status: 'start',
    });
    startEditTimer(sectionEditStartTimeRef, autoRevertTimerRef, handleFinishSectionEditing);
  }, [lockedFields, liveOverrides, emitStatus, clearTimers, setEditingSection, setEditingSectionText, handleFinishSectionEditing, finishActiveEdit]);

  const handleSectionTextChange = useCallback((newText: string) => {
    setEditingSectionText(newText);
    clearTimers();
    scheduleAutoSave(sectionEditStartTimeRef, autoRevertTimerRef, handleFinishSectionEditing);
  }, [handleFinishSectionEditing, clearTimers, setEditingSectionText]);

  // 매 렌더마다 현재 활성 편집의 finish 핸들러를 ref에 반영한다(단일 활성 편집 모델).
  // 다른 필드 편집을 시작할 때 finishActiveEdit()가 이 핸들러로 이전 필드를 종료한다.
  activeFinishRef.current =
    editingSegmentId ? handleFinishEditing
    : isEditingKeywords ? handleFinishKeywordsEditing
    : editingSection.field ? handleFinishSectionEditing
    : isEditingMainTopic ? mainTopicHandlers.handleFinishEditing
    : isEditingNextAction ? nextActionHandlers.handleFinishEditing
    : null;

  return {
    // 실시간 오버라이드 데이터
    liveOverrides,
    // Lock 상태
    lockedFields,
    // Segment handlers
    handleSegmentDoubleClick,
    handleFinishEditing,
    handleSegmentTextChange,
    handleSegmentKeyDown,
    // Main Topic handlers (useEditableField 사용)
    handleMainTopicDoubleClick: mainTopicHandlers.handleDoubleClick,
    handleFinishMainTopicEditing: mainTopicHandlers.handleFinishEditing,
    handleMainTopicTextChange: mainTopicHandlers.handleTextChange,
    // Next Action handlers (useEditableField 사용)
    handleNextActionDoubleClick: nextActionHandlers.handleDoubleClick,
    handleFinishNextActionEditing: nextActionHandlers.handleFinishEditing,
    handleNextActionTextChange: nextActionHandlers.handleTextChange,
    // Keywords handlers
    handleKeywordsDoubleClick,
    handleFinishKeywordsEditing,
    handleKeywordsTextChange,
    // Section handlers
    handleSectionDoubleClick,
    handleFinishSectionEditing,
    handleSectionTextChange,
    // Speaker handlers
    emitSetSpeaker,
    emitSetSegmentSpeaker,
    emitMergeSpeaker,
    emitSetSpeakerAlias,
    emitSpeakerStatus,
    // Status (lock) handler
    emitStatus,
  };
}
