'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface UserProfileProps {
  userName?: string;
  userPlan?: string;
  userAvatar?: string;
  className?: string;
  collapsed?: boolean;
  onSettingsClick?: () => void;
  onLogoutClick?: () => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  userName = 'Tom Miller',
  userPlan = 'Pro Plan',
  userAvatar,
  className = '',
  collapsed = false,
  onSettingsClick,
  onLogoutClick,
}) => {
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  // Collapsed view: avatar and logout icon stacked
  if (collapsed) {
    return (
      <div className={cn('flex flex-col items-center gap-2', className)}>
        <div
          className="p-1 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
          onClick={onSettingsClick}
          title={`${userName} (${userPlan})`}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm',
              'bg-gradient-to-br from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700'
            )}
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
        </div>
        {onLogoutClick && (
          <button
            className={cn(
              'p-2 rounded-md transition-colors',
              'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
              'focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-offset-neutral-800'
            )}
            onClick={onLogoutClick}
            title="로그아웃"
            aria-label="로그아웃"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Expanded view: full profile display
  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer', className)}>
      {/* Avatar */}
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm',
          'bg-gradient-to-br from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700'
        )}
      >
        {userAvatar ? (
          <img src={userAvatar} alt={userName} className="w-full h-full rounded-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 truncate">{userName}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{userPlan}</p>
      </div>

      {/* Action Icons */}
      <div className="flex items-center gap-1">
        {/* Settings Icon */}
        <button
          className={cn(
            'p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-offset-neutral-800'
          )}
          aria-label="설정"
          title="설정"
          onClick={(e) => {
            e.stopPropagation();
            onSettingsClick?.();
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Logout Icon */}
        {onLogoutClick && (
          <button
            className={cn(
              'p-1.5 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-offset-neutral-800'
            )}
            aria-label="로그아웃"
            title="로그아웃"
            onClick={(e) => {
              e.stopPropagation();
              onLogoutClick?.();
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
