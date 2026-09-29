'use client';

import React, { useState, useMemo } from 'react';
import { Speaker, Segment } from '@/types/note';
import { getSpeakerColorIndex } from '@/constants/speakers';
import { SpeakerListItem } from './SpeakerListItem';
import GuideHint from '@/components/onboarding/GuideHint';

// LiveOverrides 타입 (page.tsx에서 사용하는 것과 동일)
interface LiveOverrides {
  speakers?: Record<string, { name: string }>;
  segmentSpeakers?: Map<string, string>;
  tempSpeakers?: Record<string, string>;  // speakerId → name (임시 화자)
  aliasedSpeakers?: Record<string, string>;  // speakerId → newName (화자명 변경 대기)
}

interface SpeakerTabProps {
  speakers: Record<string, Speaker>;
  segments: Segment[];
  segmentSpeakerCounts: Record<string, number>;
  onSpeakerUpdate?: (speakerId: string, name: string) => void;
  onSpeakerMerge?: (sourceIds: string[], targetId: string) => void;
  onAddSpeaker?: () => void;
  onUtteranceClick?: (startTime: number, segmentId: string) => void;
  disabled?: boolean;
  liveOverrides?: LiveOverrides;
  formatTime: (seconds: number) => string;
  activeSegmentId?: string;
  /** 다른 사용자가 편집 중인 화자 ID Set (lock 상태) */
  lockedSpeakers?: Set<string>;
  /** 화자 편집 시작 시 호출 (lock 전송) - false 반환 시 편집 취소 */
  onSpeakerEditStart?: (speakerId: string) => boolean;
  /** 화자 편집 종료 시 호출 (lock 해제) */
  onSpeakerEditEnd?: (speakerId: string) => void;
}

/**
 * 화자 관리 탭 컴포넌트
 * 화자 목록, 통계, 편집, 발화 구간을 관리
 */
function SpeakerTab({
  speakers,
  segments,
  segmentSpeakerCounts,
  onSpeakerUpdate,
  onSpeakerMerge,
  onAddSpeaker,
  onUtteranceClick,
  disabled = false,
  liveOverrides,
  formatTime,
  activeSegmentId,
  lockedSpeakers,
  onSpeakerEditStart,
  onSpeakerEditEnd,
}: SpeakerTabProps) {
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);

  // 화자별 발화 그룹
  const speakerUtterances = useMemo(() => {
    const map: Record<string, Segment[]> = {};
    segments.forEach((segment) => {
      const speaker = liveOverrides?.segmentSpeakers?.get(String(segment.segment_id)) ?? segment.speaker;
      if (!map[speaker]) map[speaker] = [];
      map[speaker].push(segment);
    });
    return map;
  }, [segments, liveOverrides?.segmentSpeakers]);

  // 화자별 총 발화 시간
  const speakerDurations = useMemo(() => {
    const durations: Record<string, number> = {};
    segments.forEach((segment) => {
      const speaker = liveOverrides?.segmentSpeakers?.get(String(segment.segment_id)) ?? segment.speaker;
      const duration = segment.end - segment.start;
      durations[speaker] = (durations[speaker] || 0) + duration;
    });
    return durations;
  }, [segments, liveOverrides?.segmentSpeakers]);

  // DB 화자 + 임시 화자 + 화자명 변경 병합
  const mergedSpeakers = useMemo((): Record<string, Speaker> => {
    const merged = { ...speakers };
    const tempSpeakers = liveOverrides?.tempSpeakers;
    if (tempSpeakers) {
      Object.entries(tempSpeakers).forEach(([speakerId, name]) => {
        if (!merged[speakerId]) {
          merged[speakerId] = { name };
        }
      });
    }
    // 화자명 변경 대기 데이터 반영 (aliasedSpeakers)
    const aliasedSpeakers = liveOverrides?.aliasedSpeakers;
    if (aliasedSpeakers) {
      Object.entries(aliasedSpeakers).forEach(([speakerId, newName]) => {
        if (merged[speakerId]) {
          merged[speakerId] = { ...merged[speakerId], name: newName };
        }
      });
    }
    return merged;
  }, [speakers, liveOverrides?.tempSpeakers, liveOverrides?.aliasedSpeakers]);

  // 정렬된 화자 목록 (색상 인덱스 순)
  const sortedSpeakers = useMemo(() => {
    return Object.entries(mergedSpeakers).sort(([a], [b]) => {
      return getSpeakerColorIndex(a) - getSpeakerColorIndex(b);
    });
  }, [mergedSpeakers]);

  const totalSegments = segments.length;
  const speakerCount = sortedSpeakers.length;

  // 편집 핸들러
  const handleStartEdit = (speakerId: string) => {
    if (disabled) return;

    // lock 체크 및 lock 전송
    if (onSpeakerEditStart) {
      const canEdit = onSpeakerEditStart(speakerId);
      if (!canEdit) return;  // lock 획득 실패 시 편집 취소
    }

    setEditingSpeakerId(speakerId);
  };

  const handleSave = (speakerId: string, name: string) => {
    onSpeakerUpdate?.(speakerId, name);
    onSpeakerEditEnd?.(speakerId);  // lock 해제
    setEditingSpeakerId(null);
  };

  const handleCancelEdit = (speakerId: string) => {
    onSpeakerEditEnd?.(speakerId);  // lock 해제
    setEditingSpeakerId(null);
  };

  const handleMerge = (sourceSpeakerId: string, targetId: string) => {
    onSpeakerMerge?.([sourceSpeakerId], targetId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-neutral-500 dark:text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            화자 관리
          </h2>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-full">
            {speakerCount}
          </span>
          <GuideHint stepId="speaker-name-edit" />
          <GuideHint stepId="speaker-merge" />
          <GuideHint stepId="speaker-utterances" />
        </div>

        {/* 화자 추가 버튼 */}
        {onAddSpeaker && (
          <button
            type="button"
            onClick={onAddSpeaker}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20
                     hover:bg-blue-100 dark:hover:bg-blue-900/40
                     rounded-lg transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            화자 추가
          </button>
        )}
      </div>

      {/* 경고 메시지 (비활성화 상태) */}
      {disabled && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            서버와 연결되어 있지 않아 편집이 일시 중지됩니다.
          </p>
        </div>
      )}

      {/* 화자 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedSpeakers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
            <svg
              className="w-12 h-12 mb-3 text-neutral-300 dark:text-neutral-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="text-sm">화자 정보가 없습니다.</p>
          </div>
        ) : (
          sortedSpeakers.map(([speakerId, speaker], index) => {
            const colorIndex = getSpeakerColorIndex(speakerId);
            const segmentCount = segmentSpeakerCounts[speakerId] || 0;
            const totalDuration = speakerDurations[speakerId] || 0;
            const utterances = speakerUtterances[speakerId] || [];

            return (
              <SpeakerListItem
                key={speakerId}
                speakerId={speakerId}
                speaker={speaker}
                colorIndex={colorIndex}
                segmentCount={segmentCount}
                totalSegments={totalSegments}
                totalDuration={totalDuration}
                utterances={utterances}
                isEditing={editingSpeakerId === speakerId}
                onStartEdit={() => handleStartEdit(speakerId)}
                onSave={(name) => handleSave(speakerId, name)}
                onCancelEdit={() => handleCancelEdit(speakerId)}
                allSpeakers={mergedSpeakers}
                onMerge={(targetId) => handleMerge(speakerId, targetId)}
                onUtteranceClick={onUtteranceClick}
                disabled={disabled}
                formatTime={formatTime}
                activeSegmentId={activeSegmentId}
                tourTargetIds={index === 0 ? { name: 'speaker-name-edit', merge: 'speaker-merge', utterances: 'speaker-utterances' } : undefined}
                isLocked={lockedSpeakers?.has(speakerId)}
              />
            );
          })
        )}
      </div>

      {/* 도움말 푸터 */}
      {sortedSpeakers.length > 0 && (
        <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            이름을 클릭하여 편집, 화살표 아이콘으로 발화 목록 확인, 병합 아이콘으로 다른 화자와 병합
          </p>
        </div>
      )}
    </div>
  );
}

export default SpeakerTab;
