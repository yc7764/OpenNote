'use client';

import React from 'react';
import { Segment } from '@/types/note';

export interface UtteranceItemProps {
  segment: Segment;
  formatTime: (seconds: number) => string;
  onClick?: (startTime: number, segmentId: string) => void;
  isActive?: boolean;
}

/**
 * 개별 발화 항목 컴포넌트
 * 타임스탬프와 텍스트 미리보기를 표시하고 클릭 시 오디오 재생
 */
export function UtteranceItem({
  segment,
  formatTime,
  onClick,
  isActive = false,
}: UtteranceItemProps) {
  const handleClick = () => {
    onClick?.(segment.start, String(segment.segment_id));
  };

  // 텍스트 미리보기 (최대 50자)
  const textPreview = segment.text.length > 50
    ? segment.text.slice(0, 50) + '...'
    : segment.text;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        w-full text-left px-3 py-2 rounded-lg
        transition-colors duration-150
        hover:bg-neutral-100 dark:hover:bg-neutral-700
        focus:outline-none focus:ring-2 focus:ring-blue-500/50
        ${isActive
          ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-500/40'
          : 'bg-neutral-50 dark:bg-neutral-800'
        }
      `}
      aria-label={`${formatTime(segment.start)}부터 ${formatTime(segment.end)}까지의 발화 재생`}
    >
      <div className="flex items-start gap-2">
        {/* 타임스탬프 */}
        <span className="flex-shrink-0 text-xs font-mono text-neutral-500 dark:text-neutral-400 pt-0.5">
          {formatTime(segment.start)}
        </span>

        {/* 텍스트 미리보기 */}
        <p className="flex-1 text-sm text-neutral-700 dark:text-neutral-300 line-clamp-2">
          {textPreview}
        </p>
      </div>
    </button>
  );
}
