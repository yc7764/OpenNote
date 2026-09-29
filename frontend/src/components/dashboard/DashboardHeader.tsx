'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/layout/PageHeader';
import { FilterTabs, FilterType } from './FilterTabs';
import { SortDropdown, SortType } from './SortDropdown';
import { ViewToggle, ViewMode } from './ViewToggle';
import { useDeviceType } from '@/hooks/useMediaQuery';

interface DashboardHeaderProps {
  title: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter?: FilterType;
  onFilterChange?: (filter: FilterType) => void;
  activeSort: SortType;
  onSortChange: (sort: SortType) => void;
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  hideFilter?: boolean;
  className?: string;
  // Selection mode props
  isSelectionMode?: boolean;
  onEnterSelectionMode?: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title,
  searchQuery,
  onSearchChange,
  activeFilter = 'all',
  onFilterChange,
  activeSort,
  onSortChange,
  activeView,
  onViewChange,
  hideFilter = false,
  className = '',
  isSelectionMode = false,
  onEnterSelectionMode,
}) => {
  const deviceType = useDeviceType();
  const isDesktop = deviceType === 'desktop';
  const showInlineSearch = !isDesktop; // Show inline search on mobile and tablet

  return (
    <div className={cn('space-y-4 sm:space-y-6', className)}>
      {/* PageHeader with search and notifications - hidden on mobile/tablet (shown in MobileHeader) */}
      <div className="hidden desktop:block">
        <PageHeader
          title={title}
          showSearch={true}
          showNotifications={true}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />
      </div>

      {/* Mobile/Tablet search bar + controls row */}
      {showInlineSearch && (
        <div className="flex items-center gap-2">
          {/* Search input - flex-1 to take remaining space */}
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="검색..."
              className={cn(
                'w-full px-3 py-2 pl-9 rounded-lg text-sm',
                'bg-neutral-100 dark:bg-neutral-800',
                'text-neutral-900 dark:text-neutral-100',
                'placeholder:text-neutral-500 dark:placeholder:text-neutral-400',
                'border border-transparent focus:border-primary-500',
                'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
                'transition-colors duration-150'
              )}
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {/* Sort dropdown - shown in search row on mobile only */}
          <div className="sm:hidden">
            <SortDropdown activeSort={activeSort} onSortChange={onSortChange} />
          </div>
        </div>
      )}

      {/* Dashboard-specific controls: Filters, Sort, View toggle */}
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        {/* Filter tabs - horizontal scroll on mobile */}
        {!hideFilter && onFilterChange ? (
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-5 sm:-mx-1 sm:px-1 flex-shrink-0 py-1 -my-1">
            <FilterTabs activeFilter={activeFilter} onFilterChange={onFilterChange} />
          </div>
        ) : (
          <div />
        )}

        {/* Right side controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Selection mode button */}
          {onEnterSelectionMode && !isSelectionMode && (
            <button
              onClick={onEnterSelectionMode}
              className={cn(
                'flex items-center justify-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium',
                'text-neutral-600 dark:text-neutral-300',
                'hover:bg-neutral-100 dark:hover:bg-neutral-700',
                'transition-colors duration-150'
              )}
              aria-label="선택 삭제"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden sm:inline">선택 삭제</span>
            </button>
          )}
          {/* Sort dropdown - hidden on mobile (shown in search row above) */}
          <div className="hidden sm:block">
            <SortDropdown activeSort={activeSort} onSortChange={onSortChange} />
          </div>
          {/* View toggle - show on tablet+ */}
          <div className="hidden tablet:block">
            <ViewToggle activeView={activeView} onViewChange={onViewChange} />
          </div>
        </div>
      </div>
    </div>
  );
};
