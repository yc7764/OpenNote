'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type FilterType = 'all' | 'pending' | 'processing' | 'done' | 'failed';

interface FilterTabsProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  className?: string;
}

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '대기 중' },
  { value: 'processing', label: '처리 중' },
  { value: 'done', label: '완료' },
  { value: 'failed', label: '실패' },
];

export const FilterTabs: React.FC<FilterTabsProps> = ({
  activeFilter,
  onFilterChange,
  className = '',
}) => {
  return (
    <div className={cn('flex gap-1.5 sm:gap-2', className)} role="tablist">
      {FILTERS.map((filter) => (
        <button
          key={filter.value}
          role="tab"
          aria-selected={activeFilter === filter.value}
          onClick={() => onFilterChange(filter.value)}
          className={cn(
            'px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm whitespace-nowrap font-medium rounded-md transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2',
            'dark:focus:ring-offset-neutral-800',
            activeFilter === filter.value
              ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 shadow-sm'
              : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-50 border border-neutral-200 dark:border-neutral-700'
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
};
