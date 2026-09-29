'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SelectionBarProps {
  selectedCount: number;
  onCancel: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
  className?: string;
}

export const SelectionBar: React.FC<SelectionBarProps> = ({
  selectedCount,
  onCancel,
  onDelete,
  isDeleting = false,
  className = '',
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3 rounded-lg',
        'bg-white dark:bg-neutral-800',
        'border border-neutral-200 dark:border-neutral-700',
        'shadow-sm dark:shadow-md dark:shadow-black/30',
        className
      )}
    >
      {/* Left side: Cancel button and count */}
      <div className="flex items-center gap-3">
        {/* X button to cancel selection */}
        <button
          onClick={onCancel}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors',
            'text-neutral-600 dark:text-neutral-300',
            'hover:bg-neutral-100 dark:hover:bg-neutral-700',
            'hover:text-neutral-800 dark:hover:text-neutral-100',
            'focus:outline-none focus:ring-2 focus:ring-primary-500'
          )}
          aria-label="선택 해제"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-sm font-medium">선택 해제</span>
        </button>

        {/* Selected count */}
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {selectedCount}개 선택됨
        </span>
      </div>

      {/* Right side: Delete button */}
      <button
        onClick={onDelete}
        disabled={isDeleting || selectedCount === 0}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg',
          'text-white text-sm font-medium',
          'transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900',
          selectedCount === 0
            ? 'bg-neutral-300 dark:bg-neutral-600 cursor-not-allowed'
            : 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700',
          isDeleting && 'opacity-70 cursor-not-allowed'
        )}
      >
        {isDeleting ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            삭제 중...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            삭제
          </>
        )}
      </button>
    </div>
  );
};
