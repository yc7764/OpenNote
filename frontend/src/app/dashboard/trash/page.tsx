"use client";

import AuthGuard from '@/components/layout/AuthGuard';
import AppShell from '@/components/layout/AppShell';
import TrashList from '@/components/notes/TrashList';

export default function TrashPage() {
  return (
    <AuthGuard>
      <AppShell>
        <TrashList />
      </AppShell>
    </AuthGuard>
  );
}
