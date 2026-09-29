"use client";

import AuthGuard from '@/components/layout/AuthGuard';
import AppShell from '@/components/layout/AppShell';
import FavoritesList from '@/components/notes/FavoritesList';

export default function FavoritesPage() {
  return (
    <AuthGuard>
      <AppShell>
        <FavoritesList />
      </AppShell>
    </AuthGuard>
  );
}
