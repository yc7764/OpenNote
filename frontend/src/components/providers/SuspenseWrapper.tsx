"use client";
import { Suspense } from 'react';

interface SuspenseWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function SuspenseWrapper({ children, fallback }: SuspenseWrapperProps) {
  return (
    <Suspense fallback={fallback || <div className="min-h-screen flex items-center justify-center"><div className="loading-spinner h-12 w-12" /></div>}>
      {children}
    </Suspense>
  );
}