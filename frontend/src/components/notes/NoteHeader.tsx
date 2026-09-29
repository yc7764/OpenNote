'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeftIcon, StarIcon, ShareIcon, EllipsisVerticalIcon, TrashIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { toggleFavorite } from '@/services/notes';
import { toast } from 'sonner';
import ThemeToggle from '@/components/common/ThemeToggle';
import { useIsMobile } from '@/hooks/useMediaQuery';
import HelpButton from '@/components/onboarding/HelpButton';
import type { ProcessingStatus } from '@/types/note';

interface NoteHeaderProps {
  title: string;
  duration: number;
  status: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
  noteId: number;
  isFavorite: boolean;
  onBack: () => void;
  onDelete: () => void;
  onFavoriteToggle?: () => void;
}

const NoteHeader: React.FC<NoteHeaderProps> = ({
  title,
  duration,
  status,
  createdAt,
  updatedAt,
  noteId,
  isFavorite: initialIsFavorite,
  onBack,
  onDelete,
  onFavoriteToggle,
}) => {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [isToggling, setIsToggling] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleToggleFavorite = async () => {
    if (isToggling) return;

    setIsToggling(true);
    const previousState = isFavorite;
    setIsFavorite(!isFavorite);

    try {
      const result = await toggleFavorite(noteId);
      setIsFavorite(result.is_favorite);
      onFavoriteToggle?.();
    } catch {
      setIsFavorite(previousState);
    } finally {
      setIsToggling(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 모바일용 조건부 날짜 형식: 오늘→시간만, 올해→월일만, 작년이전→연월일
  const formatDateSmart = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (dateOnly.getTime() === today.getTime()) {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    }
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    }
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'pending':
        return '처리 대기 중';
      case 'processing':
        return '음성 인식 중';
      case 'summarizing':
        return '내용 요약 중';
      case 'completed':
        return '처리 완료';
      case 'failed':
        return '처리 실패';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200';
      case 'processing':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'summarizing':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'completed':
        return 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'failed':
        return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200';
    }
  };

  // 모바일 레이아웃 (컴팩트)
  if (isMobile) {
    return (
      <div className="flex flex-col px-3 py-2 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
        {/* Top row: Back + Title + Actions */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={onBack}
              className="p-1.5 -ml-1 rounded-md transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
              aria-label="뒤로 가기"
            >
              <ArrowLeftIcon className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
            </button>

            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {title}
              </h1>
              {status !== 'completed' && (
                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full shrink-0 ${getStatusColor()}`}>
                  {getStatusLabel()}
                </span>
              )}
            </div>
          </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <HelpButton />
          <button
            onClick={handleToggleFavorite}
            disabled={isToggling}
            className={`p-1.5 rounded-md transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
              isToggling ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          >
            {isFavorite ? (
              <StarIconSolid className="w-4 h-4 text-amber-400" />
            ) : (
              <StarIcon className="w-4 h-4 text-neutral-400 hover:text-amber-400" />
            )}
          </button>

          <button
            onClick={() => toast.info('공유 기능은 준비 중입니다.')}
            className="p-1.5 rounded-md transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="공유"
          >
            <ShareIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-md transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="메뉴"
            >
              <EllipsisVerticalIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 py-1 bg-white dark:bg-neutral-800
                            border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-50">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete();
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 dark:text-red-400
                           hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Bottom row: Date info */}
        <div className="flex items-center gap-2 mt-1 ml-7 text-xs text-neutral-500 dark:text-neutral-400">
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>{formatDateSmart(createdAt)}</span>
          {updatedAt && updatedAt !== createdAt && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">•</span>
              <span>수정: {formatDateSmart(updatedAt)}</span>
            </>
          )}
          {duration > 0 && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">•</span>
              <span>{formatDuration(duration)}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // 데스크톱/태블릿 레이아웃
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-4 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
      {/* Left: Back + Title + Meta */}
      <div className="flex items-center gap-4">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-md transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="뒤로 가기"
        >
          <ArrowLeftIcon className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
        </button>

        {/* Title Area */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 line-clamp-1">
              {title}
            </h1>
            <button
              onClick={handleToggleFavorite}
              disabled={isToggling}
              className={`p-1 rounded-md transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                isToggling ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            >
              {isFavorite ? (
                <StarIconSolid className="w-5 h-5 text-amber-400" />
              ) : (
                <StarIcon className="w-5 h-5 text-neutral-400 hover:text-amber-400" />
              )}
            </button>
            {status !== 'completed' && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor()}`}>
                {getStatusLabel()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400 flex-wrap">
            <span className="flex items-center gap-1">
              <CalendarIcon className="w-4 h-4" />
              {formatDate(createdAt)} {formatTime(createdAt)}
            </span>
            {updatedAt && updatedAt !== createdAt && (
              <>
                <span className="text-neutral-300 dark:text-neutral-600">•</span>
                <span className="flex items-center gap-1">
                  수정: {formatDate(updatedAt)} {formatTime(updatedAt)}
                </span>
              </>
            )}
            {duration > 0 && (
              <>
                <span className="text-neutral-300 dark:text-neutral-600">•</span>
                <span>{formatDuration(duration)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <HelpButton />

        {/* Share Button */}
        <button
          onClick={() => toast.info('공유 기능은 준비 중입니다.')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300
                   rounded-md transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="공유"
        >
          <ShareIcon className="w-4 h-4" />
          <span className="hidden sm:inline">공유</span>
        </button>

        {/* Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-md transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="메뉴"
          >
            <EllipsisVerticalIcon className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-white dark:bg-neutral-800
                          border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-50">
              <button
                onClick={() => {
                  setShowMenu(false);
                  onDelete();
                }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400
                         hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
                삭제
              </button>
            </div>
          )}
        </div>

        {/* Theme Toggle - 데스크톱에서만 표시 (모바일은 MobileHeader에 있음) */}
        <ThemeToggle />
      </div>
    </div>
  );
};

export default NoteHeader;
