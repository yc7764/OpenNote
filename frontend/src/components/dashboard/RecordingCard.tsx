'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { CalendarIcon, ClockIcon, StarIcon } from '@/components/icons';
import type { NoteListItem } from '@/services/notes';
import { toggleFavorite } from '@/services/notes';
import { useSwipeToDelete } from '@/hooks/useSwipeToDelete';
import { useIsMobile } from '@/hooks/useMediaQuery';

interface RecordingCardProps {
  note: NoteListItem;
  viewMode?: 'grid' | 'list';
  className?: string;
  onFavoriteToggle?: () => void;
  // Selection mode props
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: number) => void;
  onDelete?: (id: number) => void;
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'info' | 'default' | 'error'> = {
  uploaded: 'default',
  pending: 'default',
  processing: 'info',
  summarizing: 'warning',
  completed: 'success',
  failed: 'error',
  expired: 'error',
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: '업로드 완료',
  pending: '처리 대기 중',
  processing: '음성 인식 중',
  summarizing: '내용 요약 중',
  completed: '처리 완료',
  failed: '처리 실패',
  expired: '처리 만료',
};

// Icons for dropdown menu
const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const RecordingCardBase: React.FC<RecordingCardProps> = ({
  note,
  viewMode = 'grid',
  className = '',
  onFavoriteToggle,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  onDelete,
}) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isFavorite, setIsFavorite] = useState(note.is_favorite);
  const [isToggling, setIsToggling] = useState(false);

  // Swipe to delete (mobile list view only)
  const {
    containerRef: swipeRef,
    isSwiping,
    swipeDistance,
    isReadyToDelete,
    isDeleting,
  } = useSwipeToDelete<HTMLDivElement>({
    onDelete: () => onDelete?.(note.id),
    enabled: isMobile && viewMode === 'list' && !isSelectionMode,
    threshold: 100,
    maxSwipe: 150,
  });

  // Sync with note.is_favorite prop changes
  useEffect(() => {
    setIsFavorite(note.is_favorite);
  }, [note.is_favorite]);

  // Toggle favorite with server sync
  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isToggling) return;

    setIsToggling(true);
    const previousState = isFavorite;
    setIsFavorite(!isFavorite); // Optimistic update

    try {
      const result = await toggleFavorite(note.id);
      setIsFavorite(result.is_favorite);
      onFavoriteToggle?.();
    } catch {
      setIsFavorite(previousState); // Revert on error
    } finally {
      setIsToggling(false);
    }
  };

  // Navigate to note detail or toggle selection
  const handleCardClick = () => {
    if (isSelectionMode) {
      onSelect?.(note.id);
    } else {
      router.push(`/notes/${note.id}`);
    }
  };

  // Handle checkbox click
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(note.id);
  };

  // Handle delete from menu
  const handleDeleteClick = () => {
    onDelete?.(note.id);
  };

  // Dropdown menu items - only delete option now (selection moved to header)
  const menuItems: DropdownMenuItem[] = [
    {
      label: '삭제',
      icon: <TrashIcon />,
      onClick: handleDeleteClick,
      variant: 'danger',
    },
  ];

  const formatDate = (dateString: string) => dateFormatter.format(new Date(dateString));

  // Format duration (seconds to MM:SS)
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Extract hashtags from keywords or generate placeholder
  const extractHashtags = () => {
    // Use keywords from backend if available
    if (note.keywords && note.keywords.length > 0) {
      return note.keywords.map(keyword => keyword.startsWith('#') ? keyword : `#${keyword}`);
    }

    // Fallback to placeholder tags if no keywords
    const tags: string[] = [];

    if (note.processing_status === 'completed') {
      tags.push('#Work');
    }
    if (note.preview.length > 100) {
      tags.push('#Meeting');
    }
    if (note.is_recording) {
      tags.push('#Recording');
    }

    return tags.length > 0 ? tags : ['#Note'];
  };

  const hashtags = extractHashtags();

  // Checkbox component for selection mode
  const SelectionCheckbox = () => (
    <div
      onClick={handleCheckboxClick}
      className={cn(
        'flex items-center justify-center w-6 h-6 rounded-full cursor-pointer',
        'transition-all duration-200',
        isSelected
          ? 'bg-emerald-500 text-white'
          : 'bg-neutral-200 dark:bg-neutral-600 hover:bg-neutral-300 dark:hover:bg-neutral-500'
      )}
    >
      {isSelected && (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );

  // More menu trigger button
  const MoreMenuButton = () => (
    <button
      className={cn(
        'p-1.5 rounded-md transition-all',
        'hover:bg-neutral-50 dark:hover:bg-neutral-700',
        'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300',
        'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-offset-neutral-800'
      )}
      aria-label="More options"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
      </svg>
    </button>
  );

  if (viewMode === 'list') {
    // Mobile swipe-to-delete wrapper
    const enableSwipe = isMobile && !isSelectionMode;

    return (
      <div className={cn('relative overflow-hidden rounded-md', className)}>
        {/* Delete action background (revealed on swipe) */}
        {enableSwipe && (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-end px-4',
              'bg-red-500 dark:bg-red-600',
              'transition-opacity duration-200',
              isSwiping || isDeleting ? 'opacity-100' : 'opacity-0'
            )}
          >
            <div className={cn(
              'flex items-center gap-2 text-white font-medium',
              'transition-transform duration-200',
              isReadyToDelete ? 'scale-110' : 'scale-100'
            )}>
              <TrashIcon />
              <span className="text-sm">삭제</span>
            </div>
          </div>
        )}

        {/* Card content */}
        <div
          ref={enableSwipe ? swipeRef : undefined}
          onClick={handleCardClick}
          className={cn(
            'relative bg-white dark:bg-neutral-800 p-3 sm:p-4 cursor-pointer transition-all',
            !isSwiping && 'duration-200',
            !isSwiping && 'hover:shadow-md sm:hover:-translate-y-0.5',
            'dark:hover:shadow-lg dark:hover:shadow-black/50',
            'border-2',
            isSelected
              ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10'
              : 'border-neutral-100 dark:border-neutral-700',
            'dark:shadow-md dark:shadow-black/30',
            'group',
            isDeleting && 'opacity-0'
          )}
          style={{
            transform: enableSwipe && swipeDistance > 0
              ? `translateX(-${swipeDistance}px)`
              : undefined,
            transition: isSwiping ? 'none' : undefined,
          }}
        >
          <div className="flex items-start gap-3 sm:gap-4">
            {/* Selection checkbox */}
            {isSelectionMode && (
              <div className="flex-shrink-0 pt-1">
                <SelectionCheckbox />
              </div>
            )}

            {/* Left: Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-1.5 sm:mb-2">
                <h3 className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-neutral-50 truncate flex-1 min-w-0 break-keep">
                  {note.title}
                </h3>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge variant={STATUS_VARIANTS[note.processing_status] || 'default'} size="sm">
                    {STATUS_LABELS[note.processing_status] || note.processing_status}
                  </Badge>
                  {note.is_sample && (
                    <Badge variant="info" size="sm">샘플</Badge>
                  )}
                </div>
              </div>

              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 line-clamp-1 mb-2 sm:mb-3">{note.preview}</p>

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-neutral-500 dark:text-neutral-400 pt-2 sm:pt-3 border-t border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <CalendarIcon size={12} className="text-neutral-400 dark:text-neutral-500 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                  <span className="text-[11px] sm:text-xs">{formatDate(note.created_at)}</span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <ClockIcon size={12} className="text-neutral-400 dark:text-neutral-500 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                  <span className="text-[11px] sm:text-xs">{formatDuration(note.duration)}</span>
                </div>
                {/* Hide hashtags on mobile for space */}
                <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                  {hashtags.map((tag, idx) => (
                    <span key={idx} className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Actions - vertical on mobile, horizontal on desktop */}
            <div className="flex flex-col sm:flex-row items-center gap-0 sm:gap-1">
              {/* Menu button first (top on mobile) */}
              {!isSelectionMode && (
                <DropdownMenu
                  trigger={<MoreMenuButton />}
                  items={menuItems}
                  align="right"
                />
              )}

              {/* Favorite button second (bottom on mobile) */}
              <button
                onClick={handleToggleFavorite}
                disabled={isToggling}
                className={cn(
                  'p-1.5 sm:p-2 rounded-md transition-all touch-target',
                  'hover:bg-neutral-50 dark:hover:bg-neutral-700',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-offset-neutral-800',
                  isToggling && 'opacity-50 cursor-not-allowed',
                  isFavorite ? 'text-yellow-500 dark:text-yellow-400' : 'text-neutral-300 dark:text-neutral-600 hover:text-yellow-500 dark:hover:text-yellow-400'
                )}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <StarIcon className="w-4 h-4 sm:w-5 sm:h-5" filled={isFavorite} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Grid view (default)
  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'bg-white dark:bg-neutral-800 rounded-md p-7 cursor-pointer transition-all duration-200',
        'hover:shadow-lg hover:-translate-y-1',
        'dark:hover:shadow-2xl dark:hover:shadow-black/70 dark:hover:bg-neutral-750',
        'border-2',
        isSelected
          ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10'
          : 'border-neutral-100 dark:border-neutral-700',
        'dark:shadow-xl dark:shadow-black/50 dark:ring-1 dark:ring-neutral-700',
        'group relative',
        className
      )}
    >
      {/* Selection checkbox - absolute positioned top-left */}
      {isSelectionMode && (
        <div className="absolute top-4 left-4">
          <SelectionCheckbox />
        </div>
      )}

      {/* Header: Title, Badge, and Actions */}
      <div className={cn('flex items-start justify-between gap-2 mb-8', isSelectionMode && 'pl-10')}>
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 line-clamp-2 flex-1 min-w-0 leading-relaxed break-keep">
            {note.title}
          </h3>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Badge variant={STATUS_VARIANTS[note.processing_status] || 'default'} size="sm">
              {STATUS_LABELS[note.processing_status] || note.processing_status}
            </Badge>
            {note.is_sample && (
              <Badge variant="info" size="sm">샘플</Badge>
            )}
          </div>
        </div>

        {/* Top right actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleToggleFavorite}
            disabled={isToggling}
            className={cn(
              'p-1.5 rounded-md transition-all',
              'hover:bg-neutral-50 dark:hover:bg-neutral-700',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-offset-neutral-800',
              isToggling && 'opacity-50 cursor-not-allowed',
              isFavorite ? 'text-yellow-500 dark:text-yellow-400' : 'text-neutral-300 dark:text-neutral-600 hover:text-yellow-500 dark:hover:text-yellow-400'
            )}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <StarIcon className="w-5 h-5" filled={isFavorite} />
          </button>

          {!isSelectionMode && (
            <DropdownMenu
              trigger={<MoreMenuButton />}
              items={menuItems}
              align="right"
            />
          )}
        </div>
      </div>

      {/* Description */}
      <p className={cn('text-sm text-neutral-600 dark:text-neutral-300 line-clamp-2 mb-8 leading-relaxed', isSelectionMode && 'pl-10')}>{note.preview}</p>

      {/* Footer: Metadata and Hashtags */}
      <div className={cn('space-y-4 pt-8 border-t border-neutral-200 dark:border-neutral-700', isSelectionMode && 'pl-10')}>
        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center gap-1.5">
            <CalendarIcon size={14} className="text-neutral-400 dark:text-neutral-500" />
            <span>{formatDate(note.created_at)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ClockIcon size={14} className="text-neutral-400 dark:text-neutral-500" />
            <span>{formatDuration(note.duration)}</span>
          </div>
        </div>

        {/* Hashtags */}
        <div className="flex flex-wrap items-center gap-2">
          {hashtags.map((tag, idx) => (
            <span key={idx} className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export const RecordingCard = React.memo(RecordingCardBase);
