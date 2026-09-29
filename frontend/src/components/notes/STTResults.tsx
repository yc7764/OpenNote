'use client';

import React from 'react';
import NoteSegment, { Segment } from './NoteSegment';
import type { LiveOverrides } from '@/hooks/useNoteSocket';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Speaker } from '@/types/note';
import { getSpeakerColorIndex } from '@/constants/speakers';
import GuideHint from '@/components/onboarding/GuideHint';

interface STTResultsProps {
  segments: Segment[];
  formatTime: (seconds: number) => string;
  onSegmentClick: (startTime: number) => void;
  activeSegmentIndex?: number;
  style?: React.CSSProperties;
  // Socket editing props
  liveOverrides?: LiveOverrides;
  editingSegmentId?: string | null;
  editingText?: string;
  onSegmentDoubleClick?: (segmentId: string, currentText: string) => void;
  onSegmentTextChange?: (newText: string) => void;
  onFinishEditing?: () => void;
  onSegmentKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  // Lock 상태
  lockedSegments?: Set<string>;
  // 스피커 관리
  speakers?: Record<string, Speaker>;
  tempSpeakers?: Record<string, string>;  // 임시 화자 목록
  onSegmentSpeakerChange?: (segmentId: string, speakerId: string) => void;
  onSpeakerDropdownOpen?: (segmentId: string) => void;
  onSpeakerDropdownClose?: (segmentId: string) => void;
}

const STTResults: React.FC<STTResultsProps> = ({
  segments,
  formatTime,
  onSegmentClick,
  activeSegmentIndex = -1,
  style,
  // Socket editing props
  liveOverrides,
  editingSegmentId,
  editingText,
  onSegmentDoubleClick,
  onSegmentTextChange,
  onFinishEditing,
  onSegmentKeyDown,
  // Lock 상태
  lockedSegments,
  // 스피커 관리
  speakers,
  tempSpeakers,
  onSegmentSpeakerChange,
  onSpeakerDropdownOpen,
  onSpeakerDropdownClose,
}) => {
  const isMobile = useIsMobile();

  if (!segments || segments.length === 0) {
    return (
      <div
        className="bg-white dark:bg-neutral-900 flex flex-col h-full min-w-0 border-r border-neutral-200 dark:border-neutral-700 flex-[2] transition-colors duration-200"
        style={style}
      >
        <div className="flex flex-col items-center justify-center h-full p-10 text-center text-neutral-500 dark:text-neutral-400">
          <div className="mb-4 text-neutral-400 dark:text-neutral-500">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </div>
          <h3 className="text-neutral-700 dark:text-neutral-200 text-lg font-semibold mb-2">음성 인식 결과 없음</h3>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">음성 인식이 진행 중이거나 결과가 없습니다.</p>
        </div>
      </div>
    );
  }

  // 모바일: 컴팩트 패딩, 데스크톱: 원본 패딩
  // 내부 컨테이너는 flex-1로 남은 공간만 차지하도록 설정 (h-full 제거)
  const containerClasses = isMobile
    ? "py-3 px-3 space-y-2 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent"
    : "py-6 px-12 space-y-4 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent";

  return (
    <div
      className="bg-white dark:bg-neutral-900 flex flex-col h-full min-w-0 border-r border-neutral-200 dark:border-neutral-700 flex-[2] transition-colors duration-200"
      style={style}
    >
      {/* 온보딩 가이드 힌트 */}
      <div className={`flex items-center gap-3 ${isMobile ? 'px-3 pt-3 pb-1' : 'px-12 pt-4 pb-1'}`}>
        <div className="flex items-center gap-1.5">
          <GuideHint stepId="stt-edit" />
          <span className="text-xs text-neutral-400 dark:text-neutral-500 sr-only">텍스트 편집</span>
        </div>
        <div className="flex items-center gap-1.5">
          <GuideHint stepId="stt-speaker-change" />
          <span className="text-xs text-neutral-400 dark:text-neutral-500 sr-only">화자 변경</span>
        </div>
        <div className="flex items-center gap-1.5">
          <GuideHint stepId="audio-timestamp" />
          <span className="text-xs text-neutral-400 dark:text-neutral-500 sr-only">타임스탬프</span>
        </div>
      </div>

      <div className={containerClasses}>
        {segments.map((segment, index) => {
          const segmentIdStr = String(segment.segment_id);
          const isEditing = editingSegmentId === segmentIdStr;
          const displayText = liveOverrides?.segments.get(segmentIdStr) ?? segment.text;

          // liveOverrides에서 스피커 변경 정보 확인
          const liveSpeaker = liveOverrides?.segmentSpeakers?.get(segmentIdStr);
          // 병합된 화자 매핑 적용: sourceId → targetId
          const baseSpeakerId = liveSpeaker ?? segment.speaker;
          const displaySpeakerId = liveOverrides?.mergedSpeakers?.[baseSpeakerId] ?? baseSpeakerId;
          // 화자명: aliasedSpeakers(변경 대기) > speakers > tempSpeakers > liveOverrides.tempSpeakers
          const displaySpeakerName = liveOverrides?.aliasedSpeakers?.[displaySpeakerId]
            ?? speakers?.[displaySpeakerId]?.name
            ?? tempSpeakers?.[displaySpeakerId]
            ?? (liveOverrides?.tempSpeakers?.[displaySpeakerId]);

          // tempSpeakers 병합 (props + liveOverrides)
          const mergedTempSpeakers = {
            ...(tempSpeakers ?? {}),
            ...(liveOverrides?.tempSpeakers ?? {}),
          };

          return (
            <NoteSegment
              key={segment.segment_id}
              segment={segment}
              speakerColorIndex={getSpeakerColorIndex(displaySpeakerId)}
              onTimeClick={onSegmentClick}
              formatTime={formatTime}
              isActive={index === activeSegmentIndex}
              tourTargetIds={index === 0 ? { text: 'stt-edit', speaker: 'stt-speaker-change', segment: 'audio-timestamp' } : undefined}
              // Socket editing props
              displayText={displayText}
              isEditing={isEditing}
              editingText={isEditing ? editingText : ''}
              onDoubleClick={onSegmentDoubleClick}
              onTextChange={onSegmentTextChange}
              onFinishEditing={onFinishEditing}
              onKeyDown={onSegmentKeyDown}
              // Lock 상태
              isLocked={lockedSegments?.has(segmentIdStr)}
              // 스피커 관리
              speakers={speakers}
              tempSpeakers={mergedTempSpeakers}
              mergedSpeakers={liveOverrides?.mergedSpeakers}
              aliasedSpeakers={liveOverrides?.aliasedSpeakers}
              displaySpeakerName={displaySpeakerName}
              displaySpeakerId={displaySpeakerId}
              onSpeakerChange={onSegmentSpeakerChange}
              onSpeakerDropdownOpen={onSpeakerDropdownOpen}
              onSpeakerDropdownClose={onSpeakerDropdownClose}
            />
          );
        })}
      </div>
    </div>
  );
};

export default STTResults;
