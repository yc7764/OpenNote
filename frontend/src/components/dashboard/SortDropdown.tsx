'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export type SortType = 'newest' | 'oldest' | 'title-asc' | 'title-desc' | 'duration-asc' | 'duration-desc';

interface SortDropdownProps {
  activeSort: SortType;
  onSortChange: (sort: SortType) => void;
  className?: string;
}

const SORT_OPTIONS: { value: SortType; label: string }[] = [
  { value: 'newest', label: '최신순' },
  { value: 'oldest', label: '오래된순' },
  { value: 'title-asc', label: '제목 (가-하)' },
  { value: 'title-desc', label: '제목 (하-가)' },
  { value: 'duration-asc', label: '길이 (짧은순)' },
  { value: 'duration-desc', label: '길이 (긴순)' },
];

export const SortDropdown: React.FC<SortDropdownProps> = ({
  activeSort,
  onSortChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeSortLabel = SORT_OPTIONS.find((opt) => opt.value === activeSort)?.label || '최신순';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium',
          'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md',
          'hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
          'dark:focus:ring-offset-neutral-800'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <svg
          className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400 dark:text-neutral-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
        </svg>
        <span className="text-neutral-900 dark:text-neutral-50">{activeSortLabel}</span>
        <svg
          className={cn('w-3 h-3 sm:w-4 sm:h-4 text-neutral-400 dark:text-neutral-500 transition-transform', isOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-lg dark:shadow-2xl dark:shadow-black/50',
            'border border-neutral-200 dark:border-neutral-700 py-1 z-50',
            'ring-1 ring-black/5 dark:ring-white/10'
          )}
          role="listbox"
        >
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              role="option"
              aria-selected={activeSort === option.value}
              onClick={() => {
                onSortChange(option.value);
                setIsOpen(false);
              }}
              className={cn(
                'w-full px-4 py-2 text-left text-sm transition-colors',
                'hover:bg-neutral-50 dark:hover:bg-neutral-700',
                activeSort === option.value
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                  : 'text-neutral-700 dark:text-neutral-300'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
