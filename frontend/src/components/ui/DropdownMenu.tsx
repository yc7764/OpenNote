'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface DropdownMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  className?: string;
  onOpenChange?: (isOpen: boolean) => void;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  align = 'right',
  className = '',
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !isOpen;
    setIsOpen(newState);
    onOpenChange?.(newState);
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleItemClick = (e: React.MouseEvent, item: DropdownMenuItem) => {
    e.stopPropagation();
    if (item.disabled) return;
    item.onClick();
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={cn('relative inline-block', className)}>
      {/* Trigger */}
      <div onClick={handleToggle}>
        {trigger}
      </div>

      {/* Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1 py-1 min-w-[160px]',
            'bg-white dark:bg-neutral-800 rounded-lg shadow-lg',
            'border border-neutral-200 dark:border-neutral-700',
            'animate-in fade-in-0 zoom-in-95 duration-100',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={(e) => handleItemClick(e, item)}
              disabled={item.disabled}
              className={cn(
                'w-full px-4 py-2 text-sm text-left flex items-center gap-2',
                'transition-colors duration-150',
                item.variant === 'danger'
                  ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700',
                item.disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
