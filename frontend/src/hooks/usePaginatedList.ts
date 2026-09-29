'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { SortType } from '@/components/dashboard/SortDropdown';

interface PaginationResponse {
  current_page: number;
  total_pages: number;
  total_count: number;
  page_size: number;
}

interface PaginatedData<T> {
  notes: T[];
  pagination: PaginationResponse;
}

interface UsePaginatedListOptions<T> {
  /** sessionStorage 키 접두사 (예: 'noteList', 'favoritesList') */
  storagePrefix: string;
  /** 데이터 fetch 함수 */
  fetchFn: (params: {
    page: number;
    page_size: number;
    sort: SortType;
    search: string;
    [key: string]: unknown;
  }) => Promise<PaginatedData<T>>;
  /** SWR 캐시 키에 추가할 파라미터 생성 함수 */
  extraParams?: () => Record<string, string>;
  /** fetch 함수에 추가할 파라미터 생성 함수 */
  extraFetchParams?: () => Record<string, unknown>;
  /** SWR 캐시 키의 기본 경로 (기본값 '/api/notes/'). 목록별로 달라야 캐시가 섞이지 않는다 */
  basePath?: string;
}

export function usePaginatedList<T>({
  storagePrefix,
  fetchFn,
  extraParams,
  extraFetchParams,
  basePath = '/api/notes/',
}: UsePaginatedListOptions<T>) {
  // ── 페이지네이션 + 정렬/검색 상태 ──
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const saved = sessionStorage.getItem(`${storagePrefix}:currentPage`);
    return saved ? Number(saved) : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window === 'undefined') return 20;
    const saved = sessionStorage.getItem(`${storagePrefix}:pageSize`);
    return saved ? Number(saved) : 20;
  });
  const [activeSort, setActiveSort] = useState<SortType>('newest');
  const [searchQuery, _setSearchQuery] = useState('');
  const setSearchQuery = useCallback((q: string) => _setSearchQuery(q.slice(0, 200)), []);

  // ── 검색 디바운싱 (300ms) ──
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const prevDebouncedSearch = useRef(debouncedSearch);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── 검색어가 실제로 변경됐을 때만 1페이지로 리셋 ──
  useEffect(() => {
    if (prevDebouncedSearch.current !== debouncedSearch) {
      prevDebouncedSearch.current = debouncedSearch;
      setCurrentPage(1);
      sessionStorage.setItem(`${storagePrefix}:currentPage`, '1');
    }
  }, [debouncedSearch, storagePrefix]);

  // ── SWR ──
  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('page_size', String(pageSize));
    if (activeSort !== 'newest') params.set('sort', activeSort);
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    // 추가 파라미터 (예: status, favorites)
    if (extraParams) {
      const extra = extraParams();
      Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    }
    return `${basePath}?${params.toString()}`;
  }, [basePath, currentPage, pageSize, activeSort, debouncedSearch, extraParams]);

  const { data, isLoading, error, mutate } = useSWR(
    swrKey,
    () => fetchFn({
      page: currentPage,
      page_size: pageSize,
      sort: activeSort,
      search: debouncedSearch.trim(),
      ...(extraFetchParams ? extraFetchParams() : {}),
    }),
    { keepPreviousData: true },
  );

  const items: T[] = data?.notes || [];
  const pagination = data?.pagination;
  // 초기 로딩만 true (이후 검색/페이지 전환 시에는 keepPreviousData로 이전 데이터 유지)
  const isInitialLoading = isLoading && !data;

  // ── 정렬/페이지사이즈 변경 시 1페이지로 리셋 ──
  const handleSortChange = useCallback((sort: SortType) => {
    setActiveSort(sort);
    setCurrentPage(1);
    sessionStorage.setItem(`${storagePrefix}:currentPage`, '1');
  }, [storagePrefix]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    sessionStorage.setItem(`${storagePrefix}:pageSize`, String(size));
    sessionStorage.setItem(`${storagePrefix}:currentPage`, '1');
  }, [storagePrefix]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    sessionStorage.setItem(`${storagePrefix}:currentPage`, String(page));
  }, [storagePrefix]);

  // ── 삭제 후 페이지 동기화 ──
  const syncPageAfterMutate = useCallback(async () => {
    const updated = await mutate();
    if (updated?.pagination) {
      setCurrentPage(updated.pagination.current_page);
      sessionStorage.setItem(`${storagePrefix}:currentPage`, String(updated.pagination.current_page));
    }
  }, [mutate, storagePrefix]);

  return {
    // 상태
    items,
    pagination,
    isLoading: isInitialLoading,
    error,
    currentPage,
    pageSize,
    activeSort,
    searchQuery,
    debouncedSearch,
    // 핸들러
    setSearchQuery,
    handleSortChange,
    handlePageSizeChange,
    handlePageChange,
    syncPageAfterMutate,
    mutate,
  };
}