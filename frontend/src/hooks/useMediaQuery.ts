'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { MEDIA_QUERIES, type DeviceType } from '@/lib/breakpoints';

/**
 * SSR-safe default - prevents hydration mismatch
 * Returns false on server, actual value on client
 */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * SSR-safe default for device type
 * Returns 'mobile' on server (mobile-first approach)
 */
function getServerDeviceSnapshot(): DeviceType {
  return 'mobile';
}

/**
 * Generic media query hook using useSyncExternalStore for optimal performance
 * @param query - CSS media query string
 * @returns boolean indicating if the media query matches
 */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const matchMedia = window.matchMedia(query);
      matchMedia.addEventListener('change', callback);
      return () => matchMedia.removeEventListener('change', callback);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Check if current viewport is mobile (0-767px)
 * 3-tier system: Mobile < 768px
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MEDIA_QUERIES.mobile);
}

/**
 * Check if current viewport is mobile or tablet (< 1280px)
 * Useful for hiding desktop-only features
 */
export function useIsMobileOrTablet(): boolean {
  return useMediaQuery(MEDIA_QUERIES.mobileOrTablet);
}

/**
 * Get current device type for 3-tier responsive system
 * @returns 'mobile' | 'tablet' | 'desktop'
 *
 * Breakpoints:
 * - mobile: 0-767px
 * - tablet: 768-1279px
 * - desktop: 1280px+
 */
export function useDeviceType(): DeviceType {
  const subscribe = useCallback((callback: () => void) => {
    const mobileQuery = window.matchMedia(MEDIA_QUERIES.mobile);
    const tabletQuery = window.matchMedia(MEDIA_QUERIES.tablet);
    const desktopQuery = window.matchMedia(MEDIA_QUERIES.desktop);

    mobileQuery.addEventListener('change', callback);
    tabletQuery.addEventListener('change', callback);
    desktopQuery.addEventListener('change', callback);

    return () => {
      mobileQuery.removeEventListener('change', callback);
      tabletQuery.removeEventListener('change', callback);
      desktopQuery.removeEventListener('change', callback);
    };
  }, []);

  const getSnapshot = useCallback((): DeviceType => {
    if (window.matchMedia(MEDIA_QUERIES.desktop).matches) return 'desktop';
    if (window.matchMedia(MEDIA_QUERIES.tablet).matches) return 'tablet';
    return 'mobile';
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerDeviceSnapshot);
}
