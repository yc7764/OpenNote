'use client';

import React, { forwardRef, TextareaHTMLAttributes, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  variant?: 'default' | 'filled' | 'outlined';
  fullWidth?: boolean;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
  showCharCount?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      variant = 'outlined',
      fullWidth = false,
      resize = 'vertical',
      showCharCount = false,
      maxLength,
      className,
      id,
      ...props
    },
    ref
  ) => {
    const [charCount, setCharCount] = useState(
      props.value !== undefined ? String(props.value).length : 0
    );
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

    // controlled value와 charCount 동기화
    useEffect(() => {
      if (showCharCount && props.value !== undefined) {
        setCharCount(String(props.value).length);
      }
    }, [props.value, showCharCount]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (showCharCount) {
        setCharCount(e.target.value.length);
      }
      props.onChange?.(e);
    };

    const variantClasses = {
      default: 'border-b-2 border-neutral-300 dark:border-neutral-600 focus:border-primary-500 dark:focus:border-primary-400 bg-transparent',
      filled: 'bg-neutral-50 dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-600 focus:border-primary-500 dark:focus:border-primary-400 focus:bg-white dark:focus:bg-neutral-900',
      outlined: 'border-2 border-neutral-300 dark:border-neutral-600 rounded-md focus:border-primary-500 dark:focus:border-primary-400 bg-white dark:bg-neutral-800',
    };

    const resizeClasses = {
      none: 'resize-none',
      vertical: 'resize-y',
      horizontal: 'resize-x',
      both: 'resize',
    };

    return (
      <div className={cn('relative mb-6', fullWidth && 'w-full')}>
        {/* Label */}
        {label && (
          <label
            htmlFor={textareaId}
            className={cn(
              'block mb-2 text-sm font-medium',
              error ? 'text-status-error' : 'text-neutral-700 dark:text-neutral-300'
            )}
          >
            {label}
          </label>
        )}

        {/* Textarea Field */}
        <textarea
          ref={ref}
          id={textareaId}
          maxLength={maxLength}
          className={cn(
            // Base styles
            'w-full px-3 py-2.5 text-base outline-none transition-all duration-200',
            'text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500',
            'disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-500 dark:disabled:text-neutral-400',
            'min-h-[100px]',

            // Variant styles
            variantClasses[variant],

            // Resize
            resizeClasses[resize],

            // Error state
            error && 'border-status-error focus:border-status-error',

            // Custom className
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            error
              ? `${textareaId}-error`
              : helperText
              ? `${textareaId}-helper`
              : undefined
          }
          onChange={handleChange}
          {...props}
        />

        {/* Character Count */}
        {showCharCount && maxLength && (
          <div className="flex justify-end mt-1">
            <span
              className={cn(
                'text-xs',
                charCount > maxLength * 0.9
                  ? 'text-status-warning'
                  : 'text-neutral-500 dark:text-neutral-400'
              )}
            >
              {charCount} / {maxLength}
            </span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <p
            id={`${textareaId}-error`}
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
            id={`${textareaId}-helper`}
            className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
