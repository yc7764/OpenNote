"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobileOrTablet } from '@/hooks/useMediaQuery';

export interface ModalProps {
  open: boolean;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  variant?: 'default' | 'centered' | 'bottom';
  onClose?: () => void;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  className?: string;
  /** Force bottom sheet behavior on all devices. undefined: auto (mobile only), true: force, false: disable */
  forceBottomSheet?: boolean;
  /** Enable drag to close on bottom sheet. Default: true */
  enableDragToClose?: boolean;
}

/**
 * Modal 컴포넌트 - 모바일에서 자동으로 바텀시트로 전환
 *
 * @param open - 모달 표시 여부
 * @param title - 모달 제목
 * @param description - 모달 설명
 * @param size - 모달 크기 (sm | md | lg | xl | full)
 * @param variant - 모달 표시 방식 (default | centered | bottom)
 * @param onClose - 닫기 콜백
 * @param footer - 하단 버튼 영역
 * @param closeOnOverlayClick - 오버레이 클릭 시 닫기 (기본: true)
 * @param closeOnEscape - ESC 키로 닫기 (기본: true)
 * @param showCloseButton - 닫기 버튼 표시 (기본: true)
 * @param forceBottomSheet - 바텀시트 강제 적용 (기본: false, 모바일 자동)
 * @param enableDragToClose - 드래그하여 닫기 (기본: true)
 */
export default function Modal({
  open,
  title,
  description,
  size = 'md',
  variant = 'centered',
  onClose,
  footer,
  children,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className,
  forceBottomSheet,
  enableDragToClose = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const isMobileOrTablet = useIsMobileOrTablet();

  // Bottom sheet drag state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const currentDragY = useRef(0);

  // Determine if bottom sheet mode should be used
  // forceBottomSheet: true = force on, false = force off, undefined = auto based on device/variant
  const isBottomSheet = forceBottomSheet ?? (isMobileOrTablet && variant !== 'default');

  // Reset drag state when modal closes
  useEffect(() => {
    if (!open) {
      setDragY(0);
      setIsDragging(false);
    }
  }, [open]);

  // Drag handlers for bottom sheet
  const handleDragStart = useCallback((clientY: number) => {
    if (!isBottomSheet || !enableDragToClose) return;
    setIsDragging(true);
    dragStartY.current = clientY;
    currentDragY.current = 0;
  }, [isBottomSheet, enableDragToClose]);

  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging || !isBottomSheet) return;
    const delta = clientY - dragStartY.current;
    // Only allow dragging down (positive delta)
    currentDragY.current = Math.max(0, delta);
    setDragY(currentDragY.current);
  }, [isDragging, isBottomSheet]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging || !isBottomSheet) return;
    setIsDragging(false);

    // Close if dragged more than 100px or 30% of modal height
    const modalHeight = modalRef.current?.offsetHeight || 400;
    const threshold = Math.min(100, modalHeight * 0.3);

    if (currentDragY.current > threshold && onClose) {
      onClose();
    } else {
      setDragY(0);
    }
  }, [isDragging, isBottomSheet, onClose]);

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  }, [handleDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  }, [handleDragMove]);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // 포커스 관리: 모달 열릴 때 포커스, 닫힐 때 복원
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // 첫 번째 포커스 가능한 요소로 포커스 이동
      setTimeout(() => {
        const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements && focusableElements.length > 0) {
          focusableElements[0].focus();
        }
      }, 100);
    } else {
      // 모달 닫힐 때 이전 포커스 복원
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }
  }, [open]);

  // 포커스 트랩: Tab 키로 모달 내부 순환
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: 역방향
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: 정방향
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // ESC 키 핸들러
  useEffect(() => {
    if (!open || !closeOnEscape || !onClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, closeOnEscape, onClose]);

  // 바디 스크롤 방지
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full mx-4',
  };

  const variantStyles = {
    default: 'items-start mt-20',
    centered: 'items-center',
    bottom: 'items-end',
  };

  const handleOverlayClick = () => {
    if (closeOnOverlayClick && onClose) {
      onClose();
    }
  };

  // Bottom sheet rendering
  if (isBottomSheet) {
    return (
      <div className="fixed inset-0 z-modal flex items-end justify-center">
        {/* 오버레이 */}
        <div
          className={cn(
            'absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm',
            'transition-opacity duration-300',
            isDragging && 'transition-none'
          )}
          style={{ opacity: dragY > 0 ? Math.max(0.3, 1 - dragY / 300) : 1 }}
          onClick={handleOverlayClick}
          aria-hidden="true"
        />

        {/* 바텀시트 콘텐츠 */}
        <div
          ref={modalRef}
          className={cn(
            'relative bg-white dark:bg-neutral-800 w-full mx-4 mt-4 mb-4',
            'rounded-t-2xl shadow-2xl dark:shadow-black/50',
            'dark:ring-1 dark:ring-neutral-700',
            'flex flex-col',
            'animate-slide-in-bottom',
            !isDragging && 'transition-transform duration-300',
            className
          )}
          style={{
            transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
            maxHeight: 'calc(100vh - 6rem)',
            maxWidth: 'calc(100vw - 2rem)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          aria-describedby={description ? 'modal-description' : undefined}
        >
          {/* 드래그 핸들 */}
          {enableDragToClose && (
            <div
              className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="w-10 h-1 bg-neutral-300 dark:bg-neutral-600 rounded-full" />
            </div>
          )}

          {/* 헤더 */}
          {(title || showCloseButton) && (
            <div className="flex items-start justify-between px-4 pb-3 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0">
              <div className="flex-1">
                {title && (
                  <h3
                    id="modal-title"
                    className="text-lg font-semibold text-neutral-800 dark:text-neutral-100"
                  >
                    {title}
                  </h3>
                )}
                {description && (
                  <p
                    id="modal-description"
                    className="mt-1 text-sm text-neutral-600 dark:text-neutral-400"
                  >
                    {description}
                  </p>
                )}
              </div>

              {showCloseButton && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-4 p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors touch-target"
                  aria-label="닫기"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* 본문 - 스크롤 가능 */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0">{children}</div>

          {/* 푸터 */}
          {footer && (
            <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 flex-shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop modal rendering (original)
  return (
    <div className={cn('fixed inset-0 z-modal flex justify-center', variantStyles[variant])}>
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* 모달 콘텐츠 */}
      <div
        ref={modalRef}
        className={cn(
          'relative bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl dark:shadow-black/50 w-full',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          'dark:ring-1 dark:ring-neutral-700',
          'max-h-[90vh] overflow-hidden flex flex-col',
          sizeStyles[size],
          variant === 'bottom' && 'rounded-b-none',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-description' : undefined}
      >
        {/* 헤더 */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between p-6 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0">
            <div className="flex-1">
              {title && (
                <h3
                  id="modal-title"
                  className="text-xl font-semibold text-neutral-800 dark:text-neutral-100"
                >
                  {title}
                </h3>
              )}
              {description && (
                <p
                  id="modal-description"
                  className="mt-1 text-sm text-neutral-600 dark:text-neutral-400"
                >
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="ml-4 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                aria-label="닫기"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* 본문 - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {/* 푸터 */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 rounded-b-2xl flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}


