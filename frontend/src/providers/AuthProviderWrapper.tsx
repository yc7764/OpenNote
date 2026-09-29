"use client";
import { Suspense } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';

export default function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthProvider>
        <NotificationProvider>{children}</NotificationProvider>
      </AuthProvider>
    </Suspense>
  );
}
