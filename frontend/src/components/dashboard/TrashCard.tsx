'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { CalendarIcon, ClockIcon } from '@/components/icons';
import type { TrashNoteItem } from '@/services/notes';
import { restoreNote, permanentDelete } from '@/services/notes';
import { useConfirm } from '@/components/common/ConfirmDialog';

interface TrashCardProps {
  note: TrashNoteItem;
  viewMode?: 'grid' | 'list';
  className?: string;
  onRestoreSuccess?: () => void;
  onDeleteSuccess?: () => void;
}

export const TrashCard: React.FC<TrashCardProps> = ({
  note,
  viewMode = 'grid',
  className = '',
  onRestoreSuccess,
  onDeleteSuccess,
}) => {
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const confirm = useConfirm();

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  // Format duration (seconds to MM:SS)
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate days until permanent deletion (30 days from deleted_at)
  const getDaysRemaining = () => {
    const deletedDate = new Date(note.deleted_at);
    const expiryDate = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(0, daysRemaining);
  };

  // Handle restore
  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRestoring || isDeleting) return;

    setIsRestoring(true);
    try {
      await restoreNote(note.id);
      onRestoreSuccess?.();
    } catch {
      // Restore failed - UI state handled by finally
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle permanent delete
  const handlePermanentDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRestoring || isDeleting) return;

    const ok = await confirm({
      title: '영구 삭제',
      description: '이 노트를 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      confirmText: '영구 삭제',
      tone: 'danger',
    });
    if (!ok) return;

    setIsDeleting(true);
    try {
      await permanentDelete(note.id);
      onDeleteSuccess?.();
    } catch {
      // Delete failed - UI state handled by finally
    } finally {
      setIsDeleting(false);
    }
  };

  const daysRemaining = getDaysRemaining();

  if (viewMode === 'list') {
    return (
      <div
        className={cn(
          'bg-white dark:bg-neutral-800 rounded-md p-3 sm:p-4 transition-all duration-200',
          'border border-neutral-100 dark:border-neutral-700',
          'dark:shadow-md dark:shadow-black/30',
          className
        )}
      >
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Left: Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1.5 sm:mb-2">
              <h3 className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-neutral-50 truncate flex-1">
                {note.title}
              </h3>
              <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 whitespace-nowrap flex-shrink-0">
                {daysRemaining}일 후
              </span>
            </div>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 line-clamp-1 mb-2 sm:mb-3">{note.preview}</p>

            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 pt-2 sm:pt-3 border-t border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-1">
                <CalendarIcon size={12} className="text-neutral-400 dark:text-neutral-500 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">삭제일: </span>
                <span>{formatDate(note.deleted_at)}</span>
              </div>
              <div className="flex items-center gap-1">
                <ClockIcon size={12} className="text-neutral-400 dark:text-neutral-500 sm:w-3.5 sm:h-3.5" />
                <span>{formatDuration(note.duration)}</span>
              </div>
            </div>
          </div>

          {/* Right: Actions - vertical on mobile, horizontal on desktop */}
          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2">
            <button
              onClick={handleRestore}
              disabled={isRestoring || isDeleting}
              className={cn(
                'px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all',
                'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300',
                'hover:bg-primary-200 dark:hover:bg-primary-900/50',
                'focus:outline-none focus:ring-2 focus:ring-primary-500',
                (isRestoring || isDeleting) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isRestoring ? '...' : '복원'}
            </button>

            <button
              onClick={handlePermanentDelete}
              disabled={isRestoring || isDeleting}
              className={cn(
                'px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all',
                'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                'hover:bg-red-200 dark:hover:bg-red-900/50',
                'focus:outline-none focus:ring-2 focus:ring-red-500',
                (isRestoring || isDeleting) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isDeleting ? '...' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Grid view (default)
  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-800 rounded-md p-4 sm:p-7 transition-all duration-200',
        'border border-neutral-100 dark:border-neutral-700',
        'dark:shadow-xl dark:shadow-black/50 dark:ring-1 dark:ring-neutral-700',
        'relative',
        className
      )}
    >
      {/* Header: Title and Expiry Badge */}
      <div className="flex items-start justify-between gap-2 mb-4 sm:mb-8">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-neutral-50 line-clamp-2 flex-1 leading-relaxed">
            {note.title}
          </h3>
          <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 whitespace-nowrap flex-shrink-0">
            {daysRemaining}일 후
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 line-clamp-2 mb-4 sm:mb-8 leading-relaxed">{note.preview}</p>

      {/* Footer: Metadata */}
      <div className="space-y-3 sm:space-y-4 pt-4 sm:pt-8 border-t border-neutral-200 dark:border-neutral-700">
        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center gap-1 sm:gap-1.5">
            <CalendarIcon size={12} className="text-neutral-400 dark:text-neutral-500 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">삭제일: </span>
            <span>{formatDate(note.deleted_at)}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <ClockIcon size={12} className="text-neutral-400 dark:text-neutral-500 sm:w-3.5 sm:h-3.5" />
            <span>{formatDuration(note.duration)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestore}
            disabled={isRestoring || isDeleting}
            className={cn(
              'flex-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all',
              'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300',
              'hover:bg-primary-200 dark:hover:bg-primary-900/50',
              'focus:outline-none focus:ring-2 focus:ring-primary-500',
              (isRestoring || isDeleting) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isRestoring ? '...' : '복원'}
          </button>

          <button
            onClick={handlePermanentDelete}
            disabled={isRestoring || isDeleting}
            className={cn(
              'flex-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all',
              'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
              'hover:bg-red-200 dark:hover:bg-red-900/50',
              'focus:outline-none focus:ring-2 focus:ring-red-500',
              (isRestoring || isDeleting) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isDeleting ? '...' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
};
