'use client';

import React, { forwardRef, useState, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  variant?: 'default' | 'filled' | 'outlined';
  fullWidth?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      variant = 'default',
      fullWidth = false,
      className,
      type = 'text',
      id,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(false);
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const isFloating = isFocused || hasValue || props.value || props.defaultValue;

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      setHasValue(e.target.value !== '');
      props.onBlur?.(e);
    };

    const variantClasses = {
      default: 'border-b-2 border-neutral-300 dark:border-neutral-600 focus:border-primary-500 dark:focus:border-primary-400 bg-transparent',
      filled: 'bg-neutral-50 dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-600 focus:border-primary-500 dark:focus:border-primary-400 focus:bg-white dark:focus:bg-neutral-900',
      outlined: 'border-2 border-neutral-300 dark:border-neutral-600 rounded-md focus:border-primary-500 dark:focus:border-primary-400 bg-transparent',
    };

    return (
      <div className={cn('relative mb-6', fullWidth && 'w-full')}>
        {/* Input Field */}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            // Base styles
            'peer w-full px-3 py-2.5 text-base outline-none transition-all duration-300',
            'text-neutral-900 dark:text-white placeholder-transparent',
            'disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-500 dark:disabled:text-neutral-400',

            // Variant styles
            variantClasses[variant],

            // Error state
            error && 'border-status-error focus:border-status-error',

            // Custom className
            className
          )}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={label || ''}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />

        {/* Floating Label */}
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              // Base styles
              'absolute left-3 pointer-events-none transition-all duration-300',
              'text-neutral-500 dark:text-neutral-400',

              // Floating state
              isFloating
                ? 'top-0 -translate-y-full text-xs font-medium text-primary-500 dark:text-primary-400'
                : 'top-2.5 text-base',

              // Error state
              error && 'text-status-error',

              // Focus state (using peer)
              'peer-focus:top-0 peer-focus:-translate-y-full peer-focus:text-xs peer-focus:font-medium peer-focus:text-primary-500 dark:peer-focus:text-primary-400',

              // Disabled state
              'peer-disabled:text-neutral-400 dark:peer-disabled:text-neutral-500'
            )}
          >
            {label}
          </label>
        )}

        {/* Underline Animation (for default and filled variants) */}
        {(variant === 'default' || variant === 'filled') && (
          <span
            className={cn(
              'absolute bottom-0 left-0 h-0.5 bg-primary-500 dark:bg-primary-400 transition-all duration-300',
              'peer-focus:w-full',
              error && 'bg-status-error',
              isFocused ? 'w-full' : 'w-0'
            )}
          />
        )}

        {/* Error Message */}
        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-1.5 text-xs text-status-error font-medium flex items-center gap-1"
            role="alert"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}

        {/* Helper Text */}
        {!error && helperText && (
          <p
            id={`${inputId}-helper`}
            className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
