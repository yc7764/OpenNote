import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  rounded?: 'default' | 'full';
}

const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  dot = false,
  rounded = 'default',
  className,
  children,
  ...props
}) => {
  const variantClasses = {
    default: 'bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-600',
    primary: 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border-primary-200 dark:border-primary-700',
    success: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700',
    warning: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700',
    error: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700',
    info: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700',
    outline: 'bg-transparent text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const roundedClasses = {
    default: 'rounded-md',
    full: 'rounded-full',
  };

  return (
    <span
      className={cn(
        // Base styles
        'inline-flex items-center gap-1.5 font-medium border',
        'transition-colors duration-200',

        // Variant
        variantClasses[variant],

        // Size
        sizeClasses[size],

        // Rounded
        roundedClasses[rounded],

        // Custom className
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            'inline-block w-1.5 h-1.5 rounded-full',
            variant === 'default' && 'bg-neutral-500 dark:bg-neutral-400',
            variant === 'primary' && 'bg-primary-500 dark:bg-primary-400',
            variant === 'success' && 'bg-green-500 dark:bg-green-400',
            variant === 'warning' && 'bg-amber-500 dark:bg-amber-400',
            variant === 'error' && 'bg-red-500 dark:bg-red-400',
            variant === 'info' && 'bg-blue-500 dark:bg-blue-400',
            variant === 'outline' && 'bg-neutral-500 dark:bg-neutral-400'
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};

export default Badge;
