"use client";
import { useState, useCallback } from 'react';
import { fetchNotes, deleteNote, deleteNotes, NoteListItem } from '@/services/notes';
import Loader from '@/components/common/Loader';
import ErrorBanner from '@/components/common/ErrorBanner';
import Card from '@/components/common/Card';
import { Pagination } from '@/components/common/Pagination';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { RecordingCard } from '@/components/dashboard/RecordingCard';
import { SelectionBar } from '@/components/dashboard/SelectionBar';
import { FilterType } from '@/components/dashboard/FilterTabs';
import { ViewMode } from '@/components/dashboard/ViewToggle';
import { useNoteSelection } from '@/hooks/useNoteSelection';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

export default function NoteList() {
  const isMobile = useIsMobile();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeView, setActiveView] = useState<ViewMode>('list');
  const [isDeleting, setIsDeleting] = useState(false);

  // ── 페이지네이션 + 정렬/검색 ──
  const extraParams = useCallback(() => {
    const params: Record<string, string> = {};
    if (activeFilter !== 'all') params.status = activeFilter;
    return params;
  }, [activeFilter]);

  const extraFetchParams = useCallback(() => {
    const params: Record<string, unknown> = {};
    if (activeFilter !== 'all') params.status = activeFilter;
    return params;
  }, [activeFilter]);

  const {
    items: notes,
    pagination,
    isLoading,
    error,
    searchQuery,
    debouncedSearch,
    activeSort,
    setSearchQuery,
    handleSortChange: onSortChange,
    handlePageSizeChange,
    handlePageChange: onPageChange,
    syncPageAfterMutate,
    mutate,
  } = usePaginatedList<NoteListItem>({
    storagePrefix: 'noteList',
    fetchFn: fetchNotes,
    extraParams,
    extraFetchParams,
  });

  // ── 필터 변경 시 1페이지로 리셋 ──
  const handleFilterChange = useCallback((filter: FilterType) => {
    setActiveFilter(filter);
    onPageChange(1);
  }, [onPageChange]);

  // ── 정렬 변경 ──
  const handleSortChange = onSortChange;

  // ── Selection state ──
  const {
    isSelectionMode,
    selectedCount,
    toggle,
    isSelected,
    getSelectedArray,
    enterSelectionMode,
    exitSelectionMode,
  } = useNoteSelection();

  // ── 페이지 변경 시 선택 모드 해제 ──
  const handlePageChange = useCallback((page: number) => {
    onPageChange(page);
    if (isSelectionMode) exitSelectionMode();
  }, [onPageChange, isSelectionMode, exitSelectionMode]);

  // ── Pull to refresh ──
  const handleRefresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const {
    containerRef,
    isPulling,
    pullDistance,
    isRefreshing,
    progress,
  } = usePullToRefresh<HTMLDivElement>({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  const confirm = useConfirm();

  // ── 삭제 핸들러 ──
  const handleDeleteNote = async (noteId: number) => {
    const ok = await confirm({
      title: '노트 삭제',
      description: '이 노트를 삭제하시겠습니까?',
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await deleteNote(noteId);
      await syncPageAfterMutate();
    } catch {
      toast.error('노트 삭제에 실패했습니다.');
    }
  };

  const handleBulkDelete = async () => {
    const selectedIds = getSelectedArray();
    if (selectedIds.length === 0) return;

    const ok = await confirm({
      title: '노트 삭제',
      description: `${selectedIds.length}개의 노트를 삭제하시겠습니까?`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!ok) return;

    setIsDeleting(true);
    try {
      await deleteNotes(selectedIds);
      exitSelectionMode();
      await syncPageAfterMutate();
    } catch {
      toast.error('노트 삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };



  if (isLoading) return <Loader message="노트를 불러오는 중..." />;
  if (error) return <ErrorBanner message="노트 목록을 불러오지 못했습니다." />;

  // 모바일에서는 리스트 뷰 강제
  const effectiveView = isMobile ? 'list' : activeView;
  const containerHeight = isMobile ? 'calc(100vh - 48px)' : 'auto';

  return (
    <div
      ref={containerRef}
      className={cn(
        "p-4 sm:p-6 md:p-8 max-w-7xl mx-auto",
        isMobile
          ? "overflow-y-auto overscroll-y-none"
          : "min-h-screen overflow-auto"
      )}
      style={isMobile ? { height: containerHeight } : undefined}
    >
      {/* Pull to Refresh Indicator (mobile only) */}
      {isMobile && (isPulling || isRefreshing) && (
        <div
          className="flex justify-center items-center transition-all duration-200"
          style={{ height: pullDistance, marginTop: -pullDistance / 2 }}
        >
          <div
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-full',
              'bg-white dark:bg-neutral-800 shadow-md',
              isRefreshing && 'animate-spin'
            )}
            style={{
              transform: isRefreshing ? undefined : `rotate(${progress * 3.6}deg)`,
            }}
          >
            <ArrowPathIcon className="w-5 h-5 text-primary-500" />
          </div>
        </div>
      )}

      {/* Dashboard Header */}
      <DashboardHeader
        title="내 노트"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
        activeSort={activeSort}
        onSortChange={handleSortChange}
        activeView={effectiveView}
        onViewChange={setActiveView}
        isSelectionMode={isSelectionMode}
        onEnterSelectionMode={enterSelectionMode}
      />

      {/* Selection Bar */}
      {isSelectionMode && (
        <div className="mt-4">
          <SelectionBar
            selectedCount={selectedCount}
            onCancel={exitSelectionMode}
            onDelete={handleBulkDelete}
            isDeleting={isDeleting}
          />
        </div>
      )}

      {/* 노트 카드 리스트 */}
      <div className={isSelectionMode ? 'mt-4' : 'mt-6 sm:mt-8'}>
        {notes.length === 0 ? (
          <Card variant="default" padding="lg" className="text-center">
            <div className="py-8 sm:py-12">
              <svg className="w-12 sm:w-16 h-12 sm:h-16 mx-auto mb-4 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-neutral-600 dark:text-neutral-300 text-base sm:text-lg">
                {debouncedSearch
                  ? '검색 결과가 없습니다.'
                  : activeFilter !== 'all'
                  ? '해당 필터에 맞는 노트가 없습니다.'
                  : '아직 작성된 노트가 없습니다.'}
              </p>
            </div>
          </Card>
        ) : (
          <div className={
            effectiveView === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4'
              : 'space-y-2 sm:space-y-3'
          }>
            {notes.map(note => (
              <RecordingCard
                key={note.id}
                note={note}
                viewMode={effectiveView}
                isSelectionMode={isSelectionMode}
                isSelected={isSelected(note.id)}
                onSelect={toggle}
                onDelete={handleDeleteNote}
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

      {/* Bottom padding for FAB on mobile */}
      {isMobile && <div className="h-20" />}
    </div>
  );
}