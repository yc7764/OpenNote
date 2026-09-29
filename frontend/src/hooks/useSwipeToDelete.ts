'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

export interface SwipeToDeleteConfig {
  /** Minimum swipe distance to trigger delete action. Default: 100 */
  threshold?: number;
  /** Maximum swipe distance (visual cap). Default: 150 */
  maxSwipe?: number;
  /** Callback when delete is triggered */
  onDelete?: () => void;
  /** Whether swipe is enabled. Default: true */
  enabled?: boolean;
}

export interface SwipeToDeleteState {
  isSwiping: boolean;
  swipeDistance: number;
  isDeleting: boolean;
}

/**
 * Hook for implementing swipe-to-delete functionality
 * Works with touch devices - swipe left to reveal delete action
 */
export function useSwipeToDelete<T extends HTMLElement = HTMLDivElement>(
  config: SwipeToDeleteConfig
) {
  const { threshold = 100, maxSwipe = 150, onDelete, enabled = true } = config;

  const containerRef = useRef<T>(null);
  const [state, setState] = useState<SwipeToDeleteState>({
    isSwiping: false,
    swipeDistance: 0,
    isDeleting: false,
  });

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwipingRef = useRef<boolean>(false);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const resetState = useCallback(() => {
    setState({
      isSwiping: false,
      swipeDistance: 0,
      isDeleting: false,
    });
    isSwipingRef.current = false;
    isHorizontalSwipeRef.current = null;
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipeRef.current = null;
  }, [enabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || state.isDeleting) return;

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const deltaX = touchStartX.current - touchX;
    const deltaY = Math.abs(touchStartY.current - touchY);

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipeRef.current === null && (Math.abs(deltaX) > 10 || deltaY > 10)) {
      isHorizontalSwipeRef.current = Math.abs(deltaX) > deltaY;
    }

    // Only process horizontal swipes (left direction = positive deltaX)
    if (!isHorizontalSwipeRef.current) return;

    // Only allow left swipe (deltaX > 0)
    if (deltaX > 0) {
      isSwipingRef.current = true;
      // Apply resistance to swipe with cap
      const resistedSwipe = Math.min(
        maxSwipe,
        deltaX * 0.6 + Math.log(deltaX + 1) * 5
      );

      setState((prev) => ({
        ...prev,
        isSwiping: true,
        swipeDistance: resistedSwipe,
      }));

      // Prevent vertical scroll when horizontal swiping
      if (resistedSwipe > 20) {
        e.preventDefault();
      }
    } else {
      // Reset if swiping right
      if (isSwipingRef.current) {
        resetState();
      }
    }
  }, [enabled, state.isDeleting, maxSwipe, resetState]);

  const handleTouchEnd = useCallback(() => {
    if (!isSwipingRef.current || !enabled) return;

    const currentSwipe = state.swipeDistance;

    if (currentSwipe >= threshold) {
      // Trigger delete
      setState((prev) => ({
        ...prev,
        isDeleting: true,
        swipeDistance: maxSwipe,
      }));

      // Delay the delete callback for animation
      setTimeout(() => {
        onDelete?.();
        // Reset after delete callback
        setTimeout(resetState, 100);
      }, 200);
    } else {
      // Snap back
      resetState();
    }
  }, [enabled, state.swipeDistance, threshold, maxSwipe, onDelete, resetState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', resetState, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', resetState);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd, resetState]);

  // Progress percentage (0-100) for UI feedback
  const progress = Math.min(100, (state.swipeDistance / threshold) * 100);
  const isReadyToDelete = progress >= 100;

  return {
    containerRef,
    ...state,
    progress,
    isReadyToDelete,
    resetState,
  };
}
