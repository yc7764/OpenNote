"use client";

import Sidebar from "./Sidebar";
import MobileHeader from "./MobileHeader";
import FAB from "@/components/common/FAB";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSidebarSwipe } from "@/hooks/useSwipeGesture";
import { useDeviceType, useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/**
 * AppShell - 3-tier responsive layout component
 *
 * Device breakpoints:
 * - Mobile (0-767px): Full-width content, hidden sidebar, overlay menu
 * - Tablet (768-1279px): Collapsed sidebar (icons only, 64px width)
 * - Desktop (1280px+): Expanded sidebar (full, 256px width) - toggleable
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const deviceType = useDeviceType();
  const isMobile = useIsMobile();

  // Load desktop sidebar preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('desktopSidebarCollapsed');
    if (saved !== null) {
      setDesktopSidebarCollapsed(saved === 'true');
    }
  }, []);

  // Toggle desktop sidebar and save to localStorage
  const toggleDesktopSidebar = useCallback(() => {
    setDesktopSidebarCollapsed((prev) => {
      const newValue = !prev;
      localStorage.setItem('desktopSidebarCollapsed', String(newValue));
      return newValue;
    });
  }, []);

  // Determine sidebar state based on device type and user preference
  const isCollapsed = deviceType === 'tablet' || (deviceType === 'desktop' && desktopSidebarCollapsed);
  const showMobileHeader = deviceType === 'mobile' || deviceType === 'tablet';

  // Get page title based on current route
  const getPageTitle = useCallback(() => {
    if (pathname === '/dashboard') return '대시보드';
    if (pathname === '/dashboard/favorites') return '즐겨찾기';
    if (pathname === '/dashboard/trash') return '휴지통';
    if (pathname === '/create-note') return '새 노트';
    if (pathname === '/profile') return '프로필';
    if (pathname?.startsWith('/notes/')) return '노트';
    return 'OpenNote';
  }, [pathname]);

  // Handle sidebar toggle from external events
  useEffect(() => {
    const handler = () => setSidebarOpen((prev) => !prev);
    window.addEventListener("toggleSidebar", handler as EventListener);
    return () => window.removeEventListener("toggleSidebar", handler as EventListener);
  }, []);

  // Close sidebar on route change (mobile only)
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [pathname, isMobile]);

  // Swipe gesture to open sidebar (mobile only - left edge swipe)
  const swipeRef = useSidebarSwipe(() => {
    if (isMobile) {
      setSidebarOpen(true);
    }
  }, 20);

  // Handle FAB click - navigate to create note
  const handleFABClick = () => {
    router.push('/create-note');
  };

  // Calculate main content margin based on device type and sidebar state
  const getMainContentClass = () => {
    if (isMobile) {
      return 'ml-0 pt-12'; // Mobile: no sidebar margin, with header
    }
    if (deviceType === 'tablet') {
      return 'ml-16 pt-12'; // Tablet: collapsed sidebar with header
    }
    // Desktop: toggleable sidebar, no header
    if (desktopSidebarCollapsed) {
      return 'ml-16 pt-0'; // Collapsed sidebar
    }
    return 'ml-64 pt-0'; // Expanded sidebar
  };

  return (
    <div
      ref={swipeRef}
      className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200"
    >
      {/* Mobile/Tablet Header */}
      {showMobileHeader && (
        <MobileHeader
          title={getPageTitle()}
          onMenuClick={() => setSidebarOpen(true)}
          showMenuButton={isMobile} // Only show menu button on mobile
        />
      )}

      {/* Sidebar - Different modes based on device */}
      {/* Desktop/Tablet: Always visible sidebar (collapsed or expanded) */}
      {!isMobile && (
        <div
          className={cn(
            'fixed top-0 left-0 h-full z-sidebar',
            'bg-white dark:bg-neutral-800',
            'shadow-sidebar dark:shadow-2xl dark:shadow-black/40',
            'border-r border-neutral-100 dark:border-neutral-700',
            'transition-all duration-300 ease-in-out',
            isCollapsed ? 'w-16' : 'w-64'
          )}
        >
          <Suspense fallback={null}>
            <Sidebar
              collapsed={isCollapsed}
              onToggle={deviceType === 'desktop' ? toggleDesktopSidebar : undefined}
            />
          </Suspense>
        </div>
      )}

      {/* Mobile: Overlay sidebar */}
      {isMobile && (
        <div
          className={cn(
            'fixed top-0 left-0 h-full w-64 z-sidebar',
            'bg-white dark:bg-neutral-800',
            'shadow-sidebar dark:shadow-2xl dark:shadow-black/40',
            'border-r border-neutral-100 dark:border-neutral-700',
            'transition-transform duration-300 ease-in-out',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Suspense fallback={null}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </Suspense>
        </div>
      )}

      {/* Main Content */}
      <div className={cn('min-h-screen transition-all duration-300', getMainContentClass())}>
        {children}
      </div>

      {/* Mobile Overlay - only for mobile sidebar */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm dark:bg-black/80 z-40 animate-fade-in"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* FAB - only on mobile for dashboard pages */}
      {isMobile && (pathname === '/dashboard' || pathname === '/dashboard/favorites') && (
        <FAB
          onClick={handleFABClick}
          label="새 노트 만들기"
        />
      )}
    </div>
  );
}
