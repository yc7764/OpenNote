"use client";

import { useState } from 'react';
import { fetchTrash, emptyTrash, TrashNoteItem } from '@/services/notes';
import Loader from '@/components/common/Loader';
import ErrorBanner from '@/components/common/ErrorBanner';
import Card from '@/components/common/Card';
import { Pagination } from '@/components/common/Pagination';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { TrashCard } from '@/components/dashboard/TrashCard';
import { ViewMode } from '@/components/dashboard/ViewToggle';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { usePaginatedList } from '@/hooks/usePaginatedList';

export default function TrashList() {
  const [activeView, setActiveView] = useState<ViewMode>('list');
  const [isEmptying, setIsEmptying] = useState(false);
  const confirm = useConfirm();

  // 서버사이드 검색/정렬/페이지네이션 (내 노트 목록과 동일 패턴).
  // 기존엔 삭제 노트 전체를 받아 클라이언트에서 검색/정렬 → 대량 시 백엔드 무제한 직렬화.
  const {
    items: notes,
    pagination,
    isLoading,
    error,
    searchQuery,
    debouncedSearch,
    activeSort,
    setSearchQuery,
    handleSortChange,
    handlePageSizeChange,
    handlePageChange,
    syncPageAfterMutate,
    mutate,
  } = usePaginatedList<TrashNoteItem>({
    storagePrefix: 'trashList',
    fetchFn: fetchTrash,
    basePath: '/api/notes/trash/',
  });

  const totalCount = pagination?.total_count ?? 0;

  // 복원/영구삭제 후 현재 페이지 동기화 (마지막 항목 삭제 시 빈 페이지 방지)
  const handleRefresh = () => {
    syncPageAfterMutate();
  };

  const handleEmptyTrash = async () => {
    if (totalCount === 0) return;

    const ok = await confirm({
      title: '휴지통 비우기',
      description: `휴지통의 모든 노트(${totalCount}개)를 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
      confirmText: '비우기',
      tone: 'danger',
    });
    if (!ok) return;

    setIsEmptying(true);
    try {
      await emptyTrash();
      await mutate();
    } catch {
      // 실패 시 UI 상태만 복구 (토스트는 상위/공통 처리)
    } finally {
      setIsEmptying(false);
    }
  };

  if (isLoading) return <Loader message="휴지통을 불러오는 중..." />;
  if (error) return <ErrorBanner message="휴지통을 불러오지 못했습니다." />;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto min-h-screen">
      {/* Dashboard Header */}
      <DashboardHeader
        title="휴지통"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeSort={activeSort}
        onSortChange={handleSortChange}
        activeView={activeView}
        onViewChange={setActiveView}
        hideFilter={true}
      />

      {/* Info Banner */}
      <div className="mt-3 sm:mt-4 p-3 sm:p-4 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
          휴지통의 노트는 삭제 후 30일이 지나면 자동으로 영구 삭제됩니다.
        </p>
      </div>

      {/* Empty Trash Button */}
      {totalCount > 0 && (
        <div className="mt-3 sm:mt-4 flex justify-end">
          <button
            onClick={handleEmptyTrash}
            disabled={isEmptying}
            className={`
              px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all
              bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300
              hover:bg-red-200 dark:hover:bg-red-900/50
              focus:outline-none focus:ring-2 focus:ring-red-500
              ${isEmptying ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isEmptying ? '비우는 중...' : `휴지통 비우기 (${totalCount}개)`}
          </button>
        </div>
      )}

      {/* Trash Cards */}
      <div className="mt-6 sm:mt-8">
        {notes.length === 0 ? (
          <Card variant="default" padding="lg" className="text-center">
            <div className="py-8 sm:py-12">
              <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <p className="text-neutral-600 dark:text-neutral-300 text-base sm:text-lg">
                {debouncedSearch ? '검색 결과가 없습니다.' : '휴지통이 비어 있습니다.'}
              </p>
            </div>
          </Card>
        ) : (
          <div className={
            activeView === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4'
              : 'space-y-2 sm:space-y-3'
          }>
            {notes.map(note => (
              <TrashCard
                key={note.id}
                note={note}
                viewMode={activeView}
                onRestoreSuccess={handleRefresh}
                onDeleteSuccess={handleRefresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {pagination && (
        <Pagination
          currentPage={pagination.current_page}
          totalPages={pagination.total_pages}
          totalCount={pagination.total_count}
          pageSize={pagination.page_size}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}
