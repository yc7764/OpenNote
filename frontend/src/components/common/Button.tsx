'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'gradient';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  'aria-label'?: string;
  loadingText?: string;
}

const variantClasses: Record<Variant, string> = {
  primary: cn(
    'bg-primary-500 dark:bg-primary-600 text-white',
    'hover:bg-primary-600 dark:hover:bg-primary-700 active:bg-primary-700 dark:active:bg-primary-800',
    'focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:ring-offset-2 dark:focus:ring-offset-neutral-800',
    'disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 dark:disabled:text-neutral-500'
  ),
  secondary: cn(
    'bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100',
    'hover:bg-neutral-200 dark:hover:bg-neutral-600 active:bg-neutral-300 dark:active:bg-neutral-500',
    'focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-800',
    'disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:text-neutral-400 dark:disabled:text-neutral-600'
  ),
  outline: cn(
    'border-2 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800',
    'hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-600',
    'focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:ring-offset-2 dark:focus:ring-offset-neutral-800',
    'disabled:bg-neutral-50 dark:disabled:bg-neutral-900 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:border-neutral-200 dark:disabled:border-neutral-700'
  ),
  danger: cn(
    'bg-status-error dark:bg-red-600 text-white',
    'hover:bg-red-600 dark:hover:bg-red-700 active:bg-red-700 dark:active:bg-red-800',
    'focus:ring-2 focus:ring-status-error dark:focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-800',
    'disabled:bg-red-300 dark:disabled:bg-red-900 disabled:text-white dark:disabled:text-neutral-400'
  ),
  ghost: cn(
    'text-neutral-700 dark:text-neutral-300 bg-transparent',
    'hover:bg-neutral-100 dark:hover:bg-neutral-700 active:bg-neutral-200 dark:active:bg-neutral-600',
    'focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-800',
    'disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:bg-transparent'
  ),
  gradient: cn(
    'bg-gradient-to-r from-purple-600 to-purple-500 text-white',
    'hover:from-purple-700 hover:to-purple-600 active:from-purple-800 active:to-purple-700',
    'dark:brightness-[0.90] dark:hover:brightness-100', // 다크모드에서 살짝 어둡게
    'shadow-md hover:shadow-lg dark:shadow-xl dark:shadow-black/30',
    'focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-800',
    'disabled:opacity-50 disabled:cursor-not-allowed'
  ),
};

const sizeClasses: Record<Size, string> = {
  // Mobile-first: All sizes meet 44px min touch target on mobile
  sm: 'px-3 py-2 text-sm rounded-md min-h-[44px] sm:min-h-[36px]',
  md: 'px-4 py-2.5 text-base rounded-md min-h-[44px]',
  lg: 'px-6 py-3 text-base rounded-xl min-h-[48px]',
  xl: 'px-8 py-4 text-lg rounded-xl min-h-[52px]',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      loadingText,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center gap-2',
          'font-medium transition-all duration-200',
          'focus:outline-none',
          'disabled:cursor-not-allowed',

          // Touch optimization
          'touch-manipulation select-none',
          'active:scale-[0.98] active:transition-transform',

          // Variant & Size
          variantClasses[variant],
          sizeClasses[size],

          // Full width
          fullWidth && 'w-full',

          // Custom className
          className
        )}
        disabled={isDisabled}
        aria-label={ariaLabel}
        aria-busy={loading}
        aria-live={loading ? 'polite' : undefined}
        {...props}
      >
        {/* Loading Spinner */}
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        )}

        {/* Left Icon */}
        {!loading && leftIcon && <span aria-hidden="true">{leftIcon}</span>}

        {/* Children */}
        <span className={loading ? 'sr-only sm:not-sr-only' : undefined}>
          {loading && loadingText ? loadingText : children}
        </span>

        {/* Right Icon */}
        {!loading && rightIcon && <span aria-hidden="true">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;


