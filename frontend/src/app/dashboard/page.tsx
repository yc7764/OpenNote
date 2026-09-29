"use client";
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import AuthGuard from '@/components/layout/AuthGuard';
import AppShell from '@/components/layout/AppShell';

const NoteList = dynamic(() => import('@/components/notes/NoteList'), {
  ssr: false,
});

function DashboardContent() {
  return (
    <AppShell>
      <NoteList />
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
          <div className="tablet:ml-16 desktop:ml-64 tablet:pt-12 desktop:pt-0 p-6">
            {/* 헤더 스켈레톤 */}
            <div className="flex items-center justify-between mb-6 gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-20 bg-neutral-200 dark:bg-neutral-700 rounded-md animate-pulse desktop:hidden" />
                <div className="h-10 w-24 bg-neutral-200 dark:bg-neutral-700 rounded-md animate-pulse" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-24 bg-neutral-200 dark:bg-neutral-700 rounded-md animate-pulse" />
                <div className="h-10 w-20 bg-neutral-200 dark:bg-neutral-700 rounded-md animate-pulse" />
              </div>
            </div>

            {/* 노트 리스트 스켈레톤 */}
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700 p-5 dark:shadow-lg dark:shadow-black/50">
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 bg-neutral-200 dark:bg-neutral-700 rounded-full animate-pulse" />
                      <div className="w-5 h-5 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="h-6 w-2/3 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                      <div className="flex items-center gap-3">
                        <div className="h-5 w-16 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                        <div className="h-5 w-20 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                        <div className="h-4 w-32 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                      </div>
                      <div className="h-4 w-full bg-neutral-100 dark:bg-neutral-600 rounded animate-pulse" />
                      <div className="h-4 w-4/5 bg-neutral-100 dark:bg-neutral-600 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    >
      <AuthGuard>
        <DashboardContent />
      </AuthGuard>
    </Suspense>
  );
}