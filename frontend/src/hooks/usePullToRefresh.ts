'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

export interface PullToRefreshConfig {
  /** Minimum pull distance to trigger refresh. Default: 80 */
  threshold?: number;
  /** Maximum pull distance (for visual feedback). Default: 150 */
  maxPull?: number;
  /** Callback when refresh is triggered */
  onRefresh: () => Promise<void>;
}

export interface PullToRefreshState {
  isPulling: boolean;
  pullDistance: number;
  isRefreshing: boolean;
}

/**
 * Hook for implementing pull-to-refresh functionality
 * Works with touch devices only
 */
export function usePullToRefresh<T extends HTMLElement = HTMLDivElement>(
  config: PullToRefreshConfig
) {
  const { threshold = 80, maxPull = 150, onRefresh } = config;

  const containerRef = useRef<T>(null);
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
  });

  const touchStartY = useRef<number>(0);
  const lastTouchY = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);

  const canPull = useCallback(() => {
    const container = containerRef.current;
    if (!container) return false;

    // Check both container and window scroll position
    const windowScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const containerScrollTop = container.scrollTop;

    // Only allow pull when both are at top (with small tolerance)
    return containerScrollTop <= 2 && windowScrollTop <= 2;
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Always save touch start position for direction detection
    touchStartY.current = e.touches[0].clientY;
    lastTouchY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (state.isRefreshing) return;

    const touchY = e.touches[0].clientY;
    const deltaY = touchY - touchStartY.current;
    const isMovingDown = touchY > lastTouchY.current;
    lastTouchY.current = touchY;

    // If not at top, cancel any ongoing pull and allow normal scroll
    if (!canPull()) {
      if (isPullingRef.current) {
        isPullingRef.current = false;
        setState({ isPulling: false, pullDistance: 0, isRefreshing: false });
      }
      return;
    }

    // Only trigger pull-to-refresh when:
    // 1. At the top of scroll
    // 2. Pulling down (deltaY > 0)
    // 3. Currently moving downward (not upward scroll gesture)
    if (deltaY > 0 && isMovingDown) {
      isPullingRef.current = true;
      // Apply resistance to pull (logarithmic feel)
      const resistedPull = Math.min(
        maxPull,
        deltaY * 0.5 + Math.log(deltaY + 1) * 10
      );

      setState((prev) => ({
        ...prev,
        isPulling: true,
        pullDistance: resistedPull,
      }));

      // Prevent scroll only when actively pulling down
      if (resistedPull > 10) {
        e.preventDefault();
      }
    } else if (!isMovingDown && isPullingRef.current && deltaY <= 0) {
      // User is swiping up - cancel pull and allow normal scroll
      isPullingRef.current = false;
      setState({ isPulling: false, pullDistance: 0, isRefreshing: false });
      // Don't preventDefault - allow normal scroll to happen
    }
  }, [state.isRefreshing, canPull, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;

    isPullingRef.current = false;
    const currentPull = state.pullDistance;

    if (currentPull >= threshold && !state.isRefreshing) {
      setState((prev) => ({
        ...prev,
        isRefreshing: true,
        pullDistance: threshold,
      }));

      try {
        await onRefresh();
      } finally {
        setState({
          isPulling: false,
          pullDistance: 0,
          isRefreshing: false,
        });
      }
    } else {
      setState({
        isPulling: false,
        pullDistance: 0,
        isRefreshing: false,
      });
    }
  }, [state.pullDistance, state.isRefreshing, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Progress percentage (0-100) for UI feedback
  const progress = Math.min(100, (state.pullDistance / threshold) * 100);

  return {
    containerRef,
    ...state,
    progress,
    threshold,
  };
}
