'use client';

import { useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import ThemeToggle from '@/components/common/ThemeToggle';
import { NotificationBell, NotificationDropdown } from '@/components/notifications';
import { useAuthContext } from '@/contexts/AuthContext';

export interface PageHeaderProps {
  title: string;
  showSearch?: boolean;
  showNotifications?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  actions?: React.ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  showSearch = false,
  showNotifications = false,
  searchQuery = '',
  onSearchChange,
  actions,
  className = '',
}: PageHeaderProps) {
  const { isAuthenticated } = useAuthContext();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  return (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}>
      {/* Left: Title */}
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
        {title}
      </h1>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        {showSearch && (
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="노트 검색..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="pl-10 pr-4 py-2 w-64 rounded-md border border-neutral-200 dark:border-neutral-700
                       bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100
                       focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400
                       placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
          </div>
        )}

        {/* Notification Button */}
        {showNotifications && isAuthenticated && (
          <div className="relative">
            <NotificationBell
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            />
            <NotificationDropdown
              isOpen={isNotificationOpen}
              onClose={() => setIsNotificationOpen(false)}
            />
          </div>
        )}

        {/* Custom Actions */}
        {actions}

        {/* Theme Toggle (always shown) */}
        <ThemeToggle />
      </div>
    </div>
  );
}
