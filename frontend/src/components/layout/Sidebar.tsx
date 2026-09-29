"use client";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { UserProfile } from "@/components/dashboard/UserProfile";
import { QuotaDisplay } from "@/components/dashboard/QuotaDisplay";
import { cn } from "@/lib/utils";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { useConfirm } from '@/components/common/ConfirmDialog';

/**
 * Navigation item configuration
 */
interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  iconColor?: string;
  matchExact?: boolean;
}

/**
 * Sidebar Props
 * @param collapsed - Whether the sidebar is in collapsed mode (tablet view)
 * @param onClose - Callback to close the sidebar (mobile overlay)
 * @param onToggle - Callback to toggle sidebar visibility (desktop only)
 */
interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
  onToggle?: () => void;
}

// SVG Icon components with color support
const createIcon = (pathData: React.ReactNode) => (colorClass?: string) => (
  <svg className={cn("w-5 h-5 flex-shrink-0", colorClass)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {pathData}
  </svg>
);

const iconPaths = {
  notes: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  ),
  favorites: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  ),
  trash: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  ),
  settings: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </>
  ),
  faq: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  contact: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  ),
};

// Legacy icons object for backward compatibility
const icons = {
  notes: createIcon(iconPaths.notes)(),
  favorites: createIcon(iconPaths.favorites)(),
  trash: createIcon(iconPaths.trash)(),
  settings: createIcon(iconPaths.settings)(),
  faq: createIcon(iconPaths.faq)(),
  contact: createIcon(iconPaths.contact)(),
  logout: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  plus: (
    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 4v16m8-8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  logo: (
    <Image
      src="/opennote_logo/logo.png"
      alt="OpenNote Logo"
      width={32}
      height={32}
      className="w-8 h-8 flex-shrink-0"
      priority
    />
  ),
};

// Navigation items configuration with colors
const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: '모든 노트', icon: icons.notes, iconColor: 'text-blue-500 dark:text-blue-400', matchExact: true },
  { path: '/dashboard/favorites', label: '즐겨찾기', icon: icons.favorites, iconColor: 'text-yellow-500 dark:text-yellow-400' },
  { path: '/dashboard/trash', label: '휴지통', icon: icons.trash, iconColor: 'text-red-500 dark:text-red-400' },
];

const BOTTOM_ITEMS: NavItem[] = [
  { path: '/profile', label: '설정', icon: icons.settings, iconColor: 'text-neutral-500 dark:text-neutral-400' },
  { path: '/faq', label: 'FAQ', icon: icons.faq, iconColor: 'text-cyan-500 dark:text-cyan-400' },
  { path: '/contact', label: '문의하기', icon: icons.contact, iconColor: 'text-green-500 dark:text-green-400' },
];

export default function Sidebar({ collapsed = false, onClose, onToggle }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { username, logout } = useAuth();
  const confirm = useConfirm();

  // Check if the current path matches a nav item
  const isActive = (item: NavItem) => {
    if (item.matchExact) {
      return pathname === item.path;
    }
    return pathname.startsWith(item.path);
  };

  // Navigate and close sidebar on mobile
  const handleNavigate = (path: string) => {
    router.push(path);
    onClose?.();
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: '로그아웃',
      description: '로그아웃 하시겠습니까?',
      confirmText: '로그아웃',
    });
    if (ok) logout();
  };

  return (
    <div
      className={cn(
        'h-full flex flex-col bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo area */}
      <div
        className={cn(
          'transition-colors',
          collapsed ? 'p-4 mb-4' : 'p-6 mb-6'
        )}
      >
        <div className={cn(
          'flex items-center',
          collapsed ? 'justify-center' : 'justify-between'
        )}>
          {/* Left group: Toggle button + Logo */}
          <div className={cn(
            'flex items-center gap-2',
            collapsed && 'flex-col'
          )}>
            {/* Toggle button (expanded) */}
            {onToggle && !collapsed && (
              <button
                onClick={onToggle}
                className="hidden desktop:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex-shrink-0"
                aria-label="사이드바 접기"
                title="사이드바 접기"
              >
                <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            )}

            <div
              className={cn(
                'flex items-center cursor-pointer hover:opacity-80 transition-opacity',
                collapsed ? 'flex-col gap-2' : 'gap-2'
              )}
              onClick={() => handleNavigate('/dashboard')}
              title={collapsed ? 'OpenNote' : undefined}
            >
            {/* Toggle button (collapsed) */}
            {collapsed && onToggle && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className="hidden desktop:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                aria-label="사이드바 펼치기"
                title="사이드바 펼치기"
              >
                <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

            {icons.logo}
            {!collapsed && (
              <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
                OpenNote
              </h1>
            )}
          </div>
          </div>

          {/* Mobile close button */}
          {onClose && !collapsed && (
            <button
              onClick={onClose}
              className="desktop:hidden touch-target flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex-shrink-0"
              aria-label="사이드바 닫기"
            >
              <XMarkIcon className="w-6 h-6 text-neutral-600 dark:text-neutral-300" />
            </button>
          )}
        </div>
      </div>

      {/* New Recording CTA */}
      <div className={cn('mb-6', collapsed ? 'px-2' : 'px-4')}>
        <button
          className={cn(
            'flex items-center rounded-md',
            'bg-gradient-to-r from-purple-600 to-purple-500 text-white font-semibold',
            'hover:from-purple-700 hover:to-purple-600 transition-all duration-200',
            'dark:brightness-[0.90] dark:hover:brightness-100', // 다크모드에서 살짝 어둡게
            'shadow-md hover:shadow-lg dark:shadow-xl dark:shadow-black/30',
            'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2',
            'dark:focus:ring-offset-neutral-800',
            collapsed
              ? 'w-12 h-12 justify-center mx-auto'
              : 'w-full justify-center gap-2 px-4 py-3'
          )}
          onClick={() => handleNavigate('/create-note')}
          title={collapsed ? '새 노트' : undefined}
        >
          {icons.plus}
          {!collapsed && <span>새 노트</span>}
        </button>
      </div>

      {/* Navigation Menu */}
      <div className={cn('flex-1 space-y-1', collapsed ? 'px-2' : 'px-3')}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={cn(
              'w-full flex items-center rounded-md transition-colors',
              'text-sm font-medium',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-offset-neutral-800',
              collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5',
              isActive(item)
                ? 'bg-primary-50 dark:bg-primary-900/30'
                : 'hover:bg-neutral-50 dark:hover:bg-neutral-700'
            )}
            onClick={() => handleNavigate(item.path)}
            title={collapsed ? item.label : undefined}
          >
            <span className={item.iconColor}>{item.icon}</span>
            {!collapsed && (
              <span className={cn(
                isActive(item)
                  ? 'text-primary-700 dark:text-primary-300'
                  : 'text-neutral-700 dark:text-neutral-300'
              )}>
                {item.label}
              </span>
            )}
          </button>
        ))}

        <div className={cn('my-4 border-t border-neutral-200 dark:border-neutral-700', collapsed && 'mx-2')} />

        {BOTTOM_ITEMS.map((item) => (
          <button
            key={item.path}
            className={cn(
              'w-full flex items-center rounded-md transition-colors',
              'text-sm font-medium',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-offset-neutral-800',
              collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5',
              isActive(item)
                ? 'bg-primary-50 dark:bg-primary-900/30'
                : 'hover:bg-neutral-50 dark:hover:bg-neutral-700'
            )}
            onClick={() => handleNavigate(item.path)}
            title={collapsed ? item.label : undefined}
          >
            <span className={item.iconColor}>{item.icon}</span>
            {!collapsed && (
              <span className={cn(
                isActive(item)
                  ? 'text-primary-700 dark:text-primary-300'
                  : 'text-neutral-700 dark:text-neutral-300'
              )}>
                {item.label}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Quota Display */}
      <div className="border-t border-neutral-200 dark:border-neutral-700">
        <QuotaDisplay collapsed={collapsed} />
      </div>

      {/* User Profile */}
      <div className={cn(
        'border-t border-neutral-200 dark:border-neutral-700',
        collapsed ? 'p-2' : 'p-3'
      )}>
        <UserProfile
          userName={username || '사용자'}
          userPlan="프로 플랜"
          collapsed={collapsed}
          onSettingsClick={() => handleNavigate('/profile')}
          onLogoutClick={handleLogout}
        />
      </div>
    </div>
  );
}
