'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useClickHandler } from '@/hooks/useClickHandler';
import { Speaker } from '@/types/note';
import { SPEAKER_COLORS, getSpeakerColorIndex } from '@/constants/speakers';

export interface Segment {
  segment_id: number;
  idx: number;
  speaker: string;
  text: string;
  start: number;
}

interface NoteSegmentProps {
  segment: Segment;
  speakerColorIndex: number;
  onTimeClick: (startTime: number) => void;
  formatTime: (seconds: number) => string;
  isActive?: boolean;
  // Socket editing props
  displayText?: string;
  isEditing?: boolean;
  editingText?: string;
  onDoubleClick?: (segmentId: string, currentText: string) => void;
  onTextChange?: (newText: string) => void;
  onFinishEditing?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  // Lock 상태
  isLocked?: boolean;
  // 스피커 관리
  speakers?: Record<string, Speaker>;
  tempSpeakers?: Record<string, string>;  // 임시 화자 목록 (speakerId → name)
  mergedSpeakers?: Record<string, string>;  // 병합된 화자 매핑 (sourceId → targetId)
  aliasedSpeakers?: Record<string, string>;  // 화자명 변경 대기 (speakerId → newName)
  displaySpeakerName?: string;
  displaySpeakerId?: string;  // 표시할 speaker ID (병합 매핑 적용됨)
  onSpeakerChange?: (segmentId: string, speakerId: string) => void;
  onSpeakerDropdownOpen?: (segmentId: string) => void;
  onSpeakerDropdownClose?: (segmentId: string) => void;
  // 투어 타겟 ID
  tourTargetIds?: { text?: string; speaker?: string; timestamp?: string; segment?: string };
}

const NoteSegment: React.FC<NoteSegmentProps> = ({
  segment,
  speakerColorIndex,
  onTimeClick,
  formatTime,
  isActive = false,
  // Socket editing props
  displayText,
  isEditing = false,
  editingText = '',
  onDoubleClick,
  onTextChange,
  onFinishEditing,
  onKeyDown,
  // Lock 상태
  isLocked = false,
  // 스피커 관리
  speakers,
  tempSpeakers,
  mergedSpeakers,
  aliasedSpeakers,
  displaySpeakerName,
  displaySpeakerId,
  onSpeakerChange,
  onSpeakerDropdownOpen,
  onSpeakerDropdownClose,
  // 투어 타겟
  tourTargetIds,
}) => {
  const isMobile = useIsMobile();
  const [showSpeakerDropdown, setShowSpeakerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 현재 segment의 speaker ID (임시 변경 > 원본)
  const currentSpeakerId = displaySpeakerId ?? segment.speaker;

  // 표시할 스피커 이름 (displaySpeakerName > speakers/tempSpeakers에서 조회 > segment.speaker)
  const speakerName = displaySpeakerName
    ?? speakers?.[currentSpeakerId]?.name
    ?? tempSpeakers?.[currentSpeakerId]
    ?? currentSpeakerId;

  // 드롭다운용 전체 스피커 목록 (DB speakers + tempSpeakers + aliasedSpeakers 병합, 병합된 화자 제외)
  const allSpeakers = React.useMemo(() => {
    const result: Record<string, { name: string }> = { ...(speakers ?? {}) };
    if (tempSpeakers) {
      Object.entries(tempSpeakers).forEach(([spId, name]) => {
        if (!result[spId]) {
          result[spId] = { name };
        }
      });
    }
    // 화자명 변경 대기 데이터 반영 (aliasedSpeakers)
    if (aliasedSpeakers) {
      Object.entries(aliasedSpeakers).forEach(([spId, newName]) => {
        if (result[spId]) {
          result[spId] = { name: newName };
        }
      });
    }
    // 병합된 화자(sourceId)는 드롭다운에서 제외
    if (mergedSpeakers) {
      Object.keys(mergedSpeakers).forEach(sourceId => {
        delete result[sourceId];
      });
    }
    return result;
  }, [speakers, tempSpeakers, aliasedSpeakers, mergedSpeakers]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!showSpeakerDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSpeakerDropdown(false);
        // 외부 클릭으로 닫힐 때도 lock 해제
        onSpeakerDropdownClose?.(String(segment.segment_id));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSpeakerDropdown, segment.segment_id, onSpeakerDropdownClose]);

  const handleSpeakerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLocked && Object.keys(allSpeakers).length > 1 && onSpeakerChange) {
      const newShowDropdown = !showSpeakerDropdown;
      setShowSpeakerDropdown(newShowDropdown);
      // 드롭다운 열림/닫힘 시 lock 이벤트 전송
      if (newShowDropdown) {
        onSpeakerDropdownOpen?.(String(segment.segment_id));
      } else {
        onSpeakerDropdownClose?.(String(segment.segment_id));
      }
    }
  };

  const handleSpeakerSelect = (speakerId: string) => {
    if (speakerId !== currentSpeakerId) {
      onSpeakerChange?.(String(segment.segment_id), speakerId);
    }
    setShowSpeakerDropdown(false);
    // 드롭다운 닫힐 때 lock 해제
    onSpeakerDropdownClose?.(String(segment.segment_id));
  };

  const handleTimeClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!isEditing) {
      onTimeClick(segment.start);
    }
  };

  // useClickHandler를 사용하여 클릭/더블클릭 분리
  const handleSegmentClick = useClickHandler(
    // 단일 클릭: 시간 이동
    () => {
      if (!isEditing) {
        onTimeClick(segment.start);
      }
    },
    // 더블클릭: 편집 모드 진입
    () => {
      if (onDoubleClick) {
        onDoubleClick(String(segment.segment_id), displayText ?? segment.text);
      }
    }
  );

  const speakerColor = SPEAKER_COLORS[speakerColorIndex % SPEAKER_COLORS.length];

  const getSegmentClasses = () => {
    // 모바일: 컴팩트, 데스크톱: 원래 크기
    const base = isMobile
      ? 'py-2 px-3 cursor-pointer transition-all duration-150 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 relative'
      : 'py-4 px-5 cursor-pointer transition-all duration-150 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 relative';

    if (isLocked) {
      return `${base} opacity-60 cursor-not-allowed`;
    }
    if (isActive) {
      return `${base} !bg-blue-100 dark:!bg-blue-500/20 hover:!bg-blue-200 dark:hover:!bg-blue-500/30 ring-1 ring-blue-200 dark:ring-blue-500/40`;
    }
    return `${base} hover:bg-neutral-100 dark:hover:bg-neutral-700`;
  };

  // 텍스트 클래스
  const getTextClasses = () => {
    const base = isMobile
      ? 'text-sm leading-snug'
      : 'text-[0.95rem] leading-relaxed';

    return `${base} text-neutral-700 dark:text-neutral-200`;
  };

  // 모바일 레이아웃
  if (isMobile) {
    return (
      <div
        className={getSegmentClasses()}
        data-segment-id={segment.segment_id}
        data-idx={segment.idx}
        data-tour-target={tourTargetIds?.segment}
        onClick={handleSegmentClick}
      >
        {/* Lock 아이콘 */}
        {isLocked && (
          <div className="absolute top-1.5 right-1.5 text-neutral-400 dark:text-neutral-500">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
        )}
        <div className="flex items-center gap-2 mb-0.5">
          <div className="relative" ref={isMobile ? dropdownRef : undefined}>
            <button
              onClick={handleSpeakerClick}
              className={`font-medium text-xs ${Object.keys(allSpeakers).length > 1 && onSpeakerChange && !isLocked ? 'cursor-pointer hover:underline' : 'cursor-default'}`}
              style={{ color: `var(--speaker-color, ${speakerColor.light})` }}
              disabled={isLocked}
              data-tour-target={tourTargetIds?.speaker}
            >
              <span className="dark:hidden">{speakerName}</span>
              <span className="hidden dark:inline" style={{ color: speakerColor.dark }}>{speakerName}</span>
              {Object.keys(allSpeakers).length > 1 && onSpeakerChange && !isLocked && (
                <svg className="inline-block ml-0.5 w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              )}
            </button>
            {isMobile && showSpeakerDropdown && Object.keys(allSpeakers).length > 0 && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 min-w-[120px]">
                {Object.entries(allSpeakers).map(([spId, spData]) => {
                  const spColorIndex = getSpeakerColorIndex(spId);
                  const spColor = SPEAKER_COLORS[spColorIndex % SPEAKER_COLORS.length];
                  const isSelected = spId === currentSpeakerId;
                  return (
                    <button
                      key={spId}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSpeakerSelect(spId);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: spColor.light }}
                      />
                      <span className="dark:hidden" style={{ color: isSelected ? speakerColor.light : spColor.light }}>{spData.name}</span>
                      <span className="hidden dark:inline" style={{ color: isSelected ? speakerColor.dark : spColor.dark }}>{spData.name}</span>
                      {isSelected && <span className="ml-auto text-blue-500">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <span
            className="text-neutral-400 dark:text-neutral-500 text-[10px] py-0.5 px-1.5 bg-neutral-100 dark:bg-neutral-800 rounded transition-all hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-600 dark:hover:text-neutral-300"
            data-start-time={segment.start}
            data-tour-target={tourTargetIds?.timestamp}
            onClick={handleTimeClick}
          >
            {formatTime(segment.start)}
          </span>
        </div>
        <div
          className="segment-text cursor-pointer"
          data-start-time={segment.start}
          data-tour-target={tourTargetIds?.text}
        >
          {isEditing ? (
            <textarea
              value={editingText}
              onChange={(e) => onTextChange?.(e.target.value)}
              onBlur={onFinishEditing}
              onKeyDown={onKeyDown}
              className="w-full min-h-[40px] p-1.5 text-neutral-700 dark:text-neutral-200 text-sm leading-relaxed bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={getTextClasses()}>
              {displayText ?? segment.text}
            </span>
          )}
        </div>
      </div>
    );
  }

  // 데스크톱/태블릿 레이아웃 (원본 그대로)
  return (
    <div
      className={getSegmentClasses()}
      data-segment-id={segment.segment_id}
      data-idx={segment.idx}
      data-tour-target={tourTargetIds?.segment}
      onClick={handleSegmentClick}
    >
      {/* Lock 아이콘 */}
      {isLocked && (
        <div className="absolute top-2 right-2 text-neutral-400 dark:text-neutral-500">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
      )}
      <div className="flex items-center gap-3 mb-1">
        <div className="relative" ref={!isMobile ? dropdownRef : undefined}>
          <button
            onClick={handleSpeakerClick}
            className={`font-semibold text-sm ${Object.keys(allSpeakers).length > 1 && onSpeakerChange && !isLocked ? 'cursor-pointer hover:underline' : 'cursor-default'}`}
            style={{ color: `var(--speaker-color, ${speakerColor.light})` }}
            disabled={isLocked}
            data-tour-target={tourTargetIds?.speaker}
          >
            <span className="dark:hidden">{speakerName}</span>
            <span className="hidden dark:inline" style={{ color: speakerColor.dark }}>{speakerName}</span>
            {Object.keys(allSpeakers).length > 1 && onSpeakerChange && !isLocked && (
              <svg className="inline-block ml-1 w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            )}
          </button>
          {!isMobile && showSpeakerDropdown && Object.keys(allSpeakers).length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 min-w-[140px]">
              {Object.entries(allSpeakers).map(([spId, spData]) => {
                const spColorIndex = getSpeakerColorIndex(spId);
                const spColor = SPEAKER_COLORS[spColorIndex % SPEAKER_COLORS.length];
                const isSelected = spId === currentSpeakerId;
                return (
                  <button
                    key={spId}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpeakerSelect(spId);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: spColor.light }}
                    />
                    <span className="dark:hidden" style={{ color: isSelected ? speakerColor.light : spColor.light }}>{spData.name}</span>
                    <span className="hidden dark:inline" style={{ color: isSelected ? speakerColor.dark : spColor.dark }}>{spData.name}</span>
                    {isSelected && <span className="ml-auto text-blue-500">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <span
          className="text-neutral-400 dark:text-neutral-500 text-xs py-0.5 px-2 bg-neutral-100 dark:bg-neutral-800 rounded transition-all hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-600 dark:hover:text-neutral-300"
          data-start-time={segment.start}
          data-tour-target={tourTargetIds?.timestamp}
          onClick={handleTimeClick}
        >
          {formatTime(segment.start)}
        </span>
      </div>
      <div
        className="segment-text cursor-pointer"
        data-start-time={segment.start}
        data-tour-target={tourTargetIds?.text}
      >
        {isEditing ? (
          <textarea
            value={editingText}
            onChange={(e) => onTextChange?.(e.target.value)}
            onBlur={onFinishEditing}
            onKeyDown={onKeyDown}
            className="w-full min-h-[60px] p-2 text-neutral-700 dark:text-neutral-200 text-[0.95rem] leading-relaxed bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={getTextClasses()}>
            {displayText ?? segment.text}
          </span>
        )}
      </div>
    </div>
  );
};

export default React.memo(NoteSegment, (prev, next) => {
  return (
    prev.displayText === next.displayText &&
    prev.isEditing === next.isEditing &&
    prev.editingText === next.editingText &&
    prev.isActive === next.isActive &&
    prev.isLocked === next.isLocked &&
    prev.displaySpeakerId === next.displaySpeakerId &&
    prev.displaySpeakerName === next.displaySpeakerName &&
    prev.speakerColorIndex === next.speakerColorIndex &&
    prev.segment.segment_id === next.segment.segment_id &&
    prev.segment.text === next.segment.text &&
    prev.segment.speaker === next.segment.speaker &&
    prev.speakers === next.speakers &&
    prev.tempSpeakers === next.tempSpeakers &&
    prev.mergedSpeakers === next.mergedSpeakers &&
    prev.aliasedSpeakers === next.aliasedSpeakers &&
    prev.onTimeClick === next.onTimeClick &&
    prev.formatTime === next.formatTime &&
    prev.onDoubleClick === next.onDoubleClick &&
    prev.onTextChange === next.onTextChange &&
    prev.onFinishEditing === next.onFinishEditing &&
    prev.onKeyDown === next.onKeyDown &&
    prev.onSpeakerChange === next.onSpeakerChange &&
    prev.onSpeakerDropdownOpen === next.onSpeakerDropdownOpen &&
    prev.onSpeakerDropdownClose === next.onSpeakerDropdownClose
  );
});
