'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckIcon,
  XMarkIcon,
  BellSlashIcon,
} from '@heroicons/react/24/outline';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { cn } from '@/lib/utils';

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * NotificationDropdown - 알림 목록 드롭다운
 *
 * - 알림 목록 표시 (최대 50개)
 * - 개별 알림 클릭 시 읽음 처리 및 해당 페이지로 이동
 * - 전체 읽음 버튼
 */
export default function NotificationDropdown({
  isOpen,
  onClose,
}: NotificationDropdownProps) {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    unreadCount,
    isLoading,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useNotificationContext();

  // 드롭다운 열릴 때 알림 목록 새로고침
  useEffect(() => {
    if (isOpen) {
      refresh();
    }
  }, [isOpen, refresh]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /** 알림 클릭 핸들러 */
  const handleNotificationClick = async (notification: typeof notifications[0]) => {
    try {
      // 읽음 처리
      if (!notification.is_read) {
        await markAsRead(notification.id);
      }

      // 페이지 이동 — 내부 경로만 허용 (오픈 리다이렉트 방지)
      // '//host' 형태는 프로토콜 상대 URL이라 외부로 이동하므로 함께 차단
      if (
        notification.action_url &&
        notification.action_url.startsWith('/') &&
        !notification.action_url.startsWith('//')
      ) {
        router.push(notification.action_url);
      }

      onClose();
    } catch (error) {
      // Error silently handled
    }
  };

  /** 전체 읽음 클릭 핸들러 */
  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      // Error silently handled
    }
  };

  /** 상대 시간 포맷팅 (한국어) */
  const formatTime = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);
      const diffWeek = Math.floor(diffDay / 7);
      const diffMonth = Math.floor(diffDay / 30);

      if (diffSec < 60) return '방금 전';
      if (diffMin < 60) return `${diffMin}분 전`;
      if (diffHour < 24) return `${diffHour}시간 전`;
      if (diffDay < 7) return `${diffDay}일 전`;
      if (diffWeek < 4) return `${diffWeek}주 전`;
      if (diffMonth < 12) return `${diffMonth}개월 전`;
      return `${Math.floor(diffMonth / 12)}년 전`;
    } catch {
      return '';
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={cn(
        'absolute top-full mt-2 z-50',
        // 모바일: 화면 우측 끝에서 약간 여백, 데스크탑: 버튼 기준 우측 정렬
        'right-0 sm:right-0',
        // 모바일: 화면 너비에 맞춤, 데스크탑: 고정 너비
        'w-[calc(100vw-24px)] sm:w-80 max-w-[320px]',
        'max-h-[70vh] overflow-hidden',
        'bg-white dark:bg-neutral-800',
        'rounded-xl shadow-lg',
        'border border-neutral-200 dark:border-neutral-700',
        'flex flex-col'
      )}
      role="dialog"
      aria-label="알림"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          알림
          {unreadCount > 0 && (
            <span className="ml-2 text-xs text-neutral-500">
              ({unreadCount}개 읽지 않음)
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              title="모두 읽음 처리"
            >
              <CheckIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            title="닫기"
          >
            <XMarkIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
          </button>
        </div>
      </div>

      {/* 알림 목록 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
            <BellSlashIcon className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-sm">알림이 없습니다</p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors',
                    'hover:bg-neutral-50 dark:hover:bg-neutral-700/50',
                    !notification.is_read && 'bg-primary-50/50 dark:bg-primary-900/20'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* 읽지 않음 인디케이터 */}
                    <div className="flex-shrink-0 mt-1.5">
                      {!notification.is_read && (
                        <div className="w-2 h-2 bg-primary-500 rounded-full" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm truncate',
                          notification.is_read
                            ? 'text-neutral-600 dark:text-neutral-400'
                            : 'text-neutral-900 dark:text-neutral-100 font-medium'
                        )}
                      >
                        {notification.title}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                        {formatTime(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
