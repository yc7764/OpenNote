"use client";
type Variant = 'error' | 'warning' | 'info' | 'success';

const bg: Record<Variant, string> = {
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
};

export default function ErrorBanner({ message, variant = 'error' }: { message: string; variant?: Variant }) {
  return (
    <div className={`rounded-md border p-3 ${bg[variant]}`}>{message}</div>
  );
}


