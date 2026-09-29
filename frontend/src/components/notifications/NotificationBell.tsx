'use client';

import { BellIcon } from '@heroicons/react/24/outline';
import { BellAlertIcon } from '@heroicons/react/24/solid';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  onClick: () => void;
  className?: string;
}

/**
 * NotificationBell - 알림 아이콘 버튼
 *
 * - 읽지 않은 알림이 있으면 빨간 뱃지 표시
 * - 클릭 시 알림 드롭다운 토글
 */
export default function NotificationBell({
  onClick,
  className,
}: NotificationBellProps) {
  const { unreadCount } = useNotificationContext();
  const hasUnread = unreadCount > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative touch-target flex items-center justify-center rounded-lg',
        'hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors',
        className
      )}
      aria-label={
        hasUnread
          ? `읽지 않은 알림 ${unreadCount}개`
          : '알림 없음'
      }
    >
      {hasUnread ? (
        <BellAlertIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
      ) : (
        <BellIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
      )}

      {/* 읽지 않은 알림 뱃지 */}
      {hasUnread && (
        <span
          className={cn(
            'absolute top-0.5 right-0.5 flex items-center justify-center',
            'min-w-[16px] h-[16px] px-0.5',
            'text-[10px] font-bold text-white',
            'bg-red-500 rounded-full',
            'ring-1 ring-white dark:ring-neutral-800'
          )}
          aria-hidden="true"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
