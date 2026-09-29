'use client';

import { useCallback, useRef, useEffect } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down' | null;

export interface SwipeConfig {
  /** Minimum distance (px) to trigger swipe. Default: 50 */
  threshold?: number;
  /** Only detect swipes starting from edge. Edge width in px. Default: null (disabled) */
  edgeWidth?: number | null;
  /** Which edge to detect. Default: 'left' */
  edge?: 'left' | 'right' | 'top' | 'bottom';
  /** Prevent default touch behavior. Default: false */
  preventDefault?: boolean;
}

export interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeStart?: (direction: SwipeDirection) => void;
  onSwipeEnd?: (direction: SwipeDirection) => void;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  isEdgeSwipe: boolean;
}

const DEFAULT_CONFIG: Required<SwipeConfig> = {
  threshold: 50,
  edgeWidth: null,
  edge: 'left',
  preventDefault: false,
};

/**
 * Hook for detecting swipe gestures on touch devices
 * @param callbacks - Object containing swipe direction callbacks
 * @param config - Configuration options for swipe detection
 * @returns ref to attach to the swipeable element
 */
export function useSwipeGesture<T extends HTMLElement = HTMLDivElement>(
  callbacks: SwipeCallbacks,
  config: SwipeConfig = {}
) {
  const elementRef = useRef<T>(null);
  const touchState = useRef<TouchState | null>(null);

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const isEdgeTouch = useCallback(
    (x: number, y: number): boolean => {
      if (!mergedConfig.edgeWidth) return true;

      const element = elementRef.current;
      if (!element) return false;

      const rect = element.getBoundingClientRect();

      switch (mergedConfig.edge) {
        case 'left':
          return x - rect.left <= mergedConfig.edgeWidth;
        case 'right':
          return rect.right - x <= mergedConfig.edgeWidth;
        case 'top':
          return y - rect.top <= mergedConfig.edgeWidth;
        case 'bottom':
          return rect.bottom - y <= mergedConfig.edgeWidth;
        default:
          return true;
      }
    },
    [mergedConfig.edgeWidth, mergedConfig.edge]
  );

  const getSwipeDirection = useCallback(
    (deltaX: number, deltaY: number): SwipeDirection => {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX < mergedConfig.threshold && absY < mergedConfig.threshold) {
        return null;
      }

      if (absX > absY) {
        return deltaX > 0 ? 'right' : 'left';
      } else {
        return deltaY > 0 ? 'down' : 'up';
      }
    },
    [mergedConfig.threshold]
  );

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      const touch = e.touches[0];
      const isEdge = isEdgeTouch(touch.clientX, touch.clientY);

      touchState.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        isEdgeSwipe: isEdge,
      };

      if (isEdge && callbacks.onSwipeStart) {
        callbacks.onSwipeStart(null);
      }
    },
    [isEdgeTouch, callbacks]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!touchState.current) return;
      if (mergedConfig.edgeWidth && !touchState.current.isEdgeSwipe) return;

      if (mergedConfig.preventDefault) {
        e.preventDefault();
      }
    },
    [mergedConfig.edgeWidth, mergedConfig.preventDefault]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!touchState.current) return;
      if (mergedConfig.edgeWidth && !touchState.current.isEdgeSwipe) {
        touchState.current = null;
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchState.current.startX;
      const deltaY = touch.clientY - touchState.current.startY;

      const direction = getSwipeDirection(deltaX, deltaY);

      if (direction) {
        switch (direction) {
          case 'left':
            callbacks.onSwipeLeft?.();
            break;
          case 'right':
            callbacks.onSwipeRight?.();
            break;
          case 'up':
            callbacks.onSwipeUp?.();
            break;
          case 'down':
            callbacks.onSwipeDown?.();
            break;
        }
      }

      callbacks.onSwipeEnd?.(direction);
      touchState.current = null;
    },
    [callbacks, getSwipeDirection, mergedConfig.edgeWidth]
  );

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, {
      passive: !mergedConfig.preventDefault,
    });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, mergedConfig.preventDefault]);

  return elementRef;
}

/**
 * Simplified hook for sidebar swipe (left edge → right swipe to open)
 */
export function useSidebarSwipe(onOpen: () => void, edgeWidth = 20) {
  return useSwipeGesture(
    { onSwipeRight: onOpen },
    { edgeWidth, edge: 'left', threshold: 50 }
  );
}
