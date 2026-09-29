'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated' | 'gradient';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  clickable?: boolean;
  onClickCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * Card 컴포넌트
 *
 * @param variant - 카드 스타일 변형 (default | outlined | elevated | gradient)
 * @param padding - 내부 여백 크기 (none | sm | md | lg)
 * @param hoverable - 호버 효과 활성화
 * @param clickable - 클릭 가능 스타일 (커서 포인터, 호버 효과)
 */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({
    variant = 'default',
    padding = 'md',
    hoverable = false,
    clickable = false,
    className,
    children,
    onClickCapture,
    onClick,
    ...props
  }, ref) => {
    const baseStyles = 'rounded-2xl transition-all duration-200';

    const variantStyles = {
      default: 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700',
      outlined: 'bg-white dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-600',
      elevated: 'bg-white dark:bg-neutral-800 shadow-lg dark:shadow-2xl dark:shadow-black/50 border border-neutral-100 dark:border-neutral-700 dark:ring-1 dark:ring-neutral-700',
      gradient: 'bg-gradient-to-br from-white to-gradient-sky-light dark:from-neutral-900 dark:to-neutral-800 border border-primary-100 dark:border-neutral-700',
    };

    const paddingStyles = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    };

    const interactionStyles = cn(
      hoverable && 'hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-black/70 hover:scale-[1.02] hover:border-primary-200 dark:hover:border-primary-600',
      clickable && 'cursor-pointer hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-black/70 hover:scale-[1.02] hover:border-primary-300 dark:hover:border-primary-600 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-800'
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (clickable && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const syntheticEvent = e as unknown as React.MouseEvent<HTMLDivElement>;
        onClick?.(syntheticEvent);
        onClickCapture?.(syntheticEvent);
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          paddingStyles[padding],
          interactionStyles,
          className
        )}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? handleKeyDown : undefined}
        onClick={onClick}
        onClickCapture={onClickCapture}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
