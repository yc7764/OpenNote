"use client";

import { useState, useCallback } from 'react';
import { fetchFavorites, deleteNote, deleteNotes, NoteListItem } from '@/services/notes';
import Loader from '@/components/common/Loader';
import ErrorBanner from '@/components/common/ErrorBanner';
import Card from '@/components/common/Card';
import { Pagination } from '@/components/common/Pagination';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { RecordingCard } from '@/components/dashboard/RecordingCard';
import { SelectionBar } from '@/components/dashboard/SelectionBar';
import { ViewMode } from '@/components/dashboard/ViewToggle';
import { useNoteSelection } from '@/hooks/useNoteSelection';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

export default function FavoritesList() {
  const [activeView, setActiveView] = useState<ViewMode>('list');
  const [isDeleting, setIsDeleting] = useState(false);
  const confirm = useConfirm();

  // ── 페이지네이션 + 정렬/검색 ──
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
    handlePageChange: onPageChange,
    syncPageAfterMutate,
    mutate,
  } = usePaginatedList<NoteListItem>({
    storagePrefix: 'favoritesList',
    fetchFn: fetchFavorites,
    // M6: extraParams가 없으면 SWR 키가 전체 노트 목록('/api/notes/?page=…')과 동일해져
    // 두 목록이 같은 캐시를 공유·오염한다. favorites 표시를 키에 포함시켜 분리한다.
    extraParams: () => ({ favorites: 'true' }),
  });

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

  // ── 즐겨찾기 토글 시 목록 갱신 ──
  const handleFavoriteToggle = () => {
    mutate();
  };

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

  if (isLoading) return <Loader message="즐겨찾기를 불러오는 중..." />;
  if (error) return <ErrorBanner message="즐겨찾기 목록을 불러오지 못했습니다." />;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Dashboard Header - 필터 탭 숨김 (즐겨찾기는 필터 불필요) */}
      <DashboardHeader
        title="즐겨찾기"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeSort={activeSort}
        onSortChange={handleSortChange}
        activeView={activeView}
        onViewChange={setActiveView}
        hideFilter={true}
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

      {/* 즐겨찾기 카드 리스트 */}
      <div className={isSelectionMode ? 'mt-4' : 'mt-8'}>
        {notes.length === 0 ? (
          <Card variant="default" padding="lg" className="text-center">
            <div className="py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
              <p className="text-neutral-600 dark:text-neutral-300 text-lg">
                {debouncedSearch
                  ? '검색 결과가 없습니다.'
                  : '즐겨찾기한 노트가 없습니다.'}
              </p>
              <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-2">
                노트에서 별 아이콘을 클릭하여 즐겨찾기에 추가할 수 있습니다.
              </p>
            </div>
          </Card>
        ) : (
          <div className={
            activeView === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
              : 'space-y-3'
          }>
            {notes.map(note => (
              <RecordingCard
                key={note.id}
                note={note}
                viewMode={activeView}
                onFavoriteToggle={handleFavoriteToggle}
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
    </div>
  );
}