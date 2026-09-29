'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { GridIcon, ListIcon } from '@/components/icons';

export type ViewMode = 'grid' | 'list';

interface ViewToggleProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({
  activeView,
  onViewChange,
  className = '',
}) => {
  return (
    <div className={cn('flex gap-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md p-1', className)}>
      <button
        onClick={() => onViewChange('grid')}
        aria-label="Grid view"
        aria-pressed={activeView === 'grid'}
        className={cn(
          'p-2 rounded transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-offset-neutral-800',
          activeView === 'grid'
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
            : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'
        )}
      >
        <GridIcon size={20} />
      </button>
      <button
        onClick={() => onViewChange('list')}
        aria-label="List view"
        aria-pressed={activeView === 'list'}
        className={cn(
          'p-2 rounded transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-offset-neutral-800',
          activeView === 'list'
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
            : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'
        )}
      >
        <ListIcon size={20} />
      </button>
    </div>
  );
};
