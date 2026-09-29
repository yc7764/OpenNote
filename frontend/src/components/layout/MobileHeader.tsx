'use client';

import { useState } from 'react';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { SunIcon, MoonIcon } from '@heroicons/react/24/solid';
import { NotificationBell, NotificationDropdown } from '@/components/notifications';
import { useAuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface MobileHeaderProps {
  title?: string;
  onMenuClick: () => void;
  showMenuButton?: boolean; // Only show on mobile, not tablet
}

/**
 * MobileHeader - Header component for mobile and tablet views
 *
 * Device behavior:
 * - Mobile (0-767px): Shows hamburger menu + title + actions
 * - Tablet (768-1279px): Shows title + actions (no hamburger, sidebar is visible)
 */
export default function MobileHeader({
  title = 'OpenNote',
  onMenuClick,
  showMenuButton = true,
}: MobileHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated } = useAuthContext();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  return (
    <header
      className={cn(
        'desktop:hidden fixed top-0 right-0 h-12 z-mobile-header',
        'bg-white dark:bg-neutral-800',
        'border-b border-neutral-200 dark:border-neutral-700',
        'flex items-center justify-between px-3',
        'safe-area-inset-top',
        // Adjust left position based on sidebar visibility
        showMenuButton ? 'left-0' : 'left-16' // tablet has collapsed sidebar (64px)
      )}
    >
      {/* Left: Hamburger menu (mobile only) */}
      {showMenuButton ? (
        <button
          onClick={onMenuClick}
          className="touch-target flex items-center justify-center -ml-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          aria-label="메뉴 열기"
        >
          <Bars3Icon className="w-6 h-6 text-neutral-700 dark:text-neutral-200" />
        </button>
      ) : (
        <div className="w-6" /> // Spacer for tablet layout balance
      )}

      {/* Center: Title - flexible width with truncation */}
      <h1 className="flex-1 text-center text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate px-2">
        {title}
      </h1>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Notification Button */}
        {isAuthenticated && (
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

        <button
          onClick={toggleTheme}
          className="touch-target flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {theme === 'dark' ? (
            <SunIcon className="w-5 h-5 text-amber-400" />
          ) : (
            <MoonIcon className="w-5 h-5 text-neutral-600" />
          )}
        </button>
      </div>
    </header>
  );
}
