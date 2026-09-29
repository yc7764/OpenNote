'use client';

import { PlusIcon } from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';

interface FABProps {
  onClick: () => void;
  icon?: React.ReactNode;
  label?: string;
  className?: string;
  position?: 'bottom-right' | 'bottom-center';
}

/**
 * Floating Action Button for primary actions on mobile
 * Positioned above safe area for devices with home indicator
 */
export default function FAB({
  onClick,
  icon,
  label = '새 노트',
  className,
  position = 'bottom-right',
}: FABProps) {
  const positionClasses = {
    'bottom-right': 'right-4 sm:right-6',
    'bottom-center': 'left-1/2 -translate-x-1/2',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'fixed z-fab',
        'bottom-6 pb-safe-bottom',
        positionClasses[position],
        'flex items-center justify-center',
        'w-14 h-14 rounded-full',
        'bg-gradient-to-r from-purple-600 to-purple-500',
        'hover:from-purple-700 hover:to-purple-600 active:from-purple-800 active:to-purple-700',
        'dark:brightness-[0.70] dark:hover:brightness-90', // 다크모드에서 어둡게
        'text-white shadow-lg hover:shadow-xl dark:shadow-xl dark:shadow-black/30',
        'transition-all duration-200 ease-out',
        'active:scale-95',
        'desktop:hidden', // Hide on desktop (1280px+)
        className
      )}
      aria-label={label}
    >
      {icon || <PlusIcon className="w-7 h-7" />}
    </button>
  );
}
