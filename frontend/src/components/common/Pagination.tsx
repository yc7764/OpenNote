'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

/** 페이지 사이즈 선택지 */
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
}

/**
 * 페이지 번호 목록을 생성하는 헬퍼
 *
 * Desktop/Tablet: 첫/끝 페이지 항상 표시 + 현재 ±2 siblings + 생략 부호
 *   예) currentPage=5, totalPages=10 → [1, '...', 3, 4, 5, 6, 7, '...', 10]
 *
 * Mobile: 현재 페이지 중심으로 최대 5개 윈도우 (슬라이딩)
 *   예) currentPage=4, totalPages=10 → [2, 3, 4, 5, 6]
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number,
  isMobile: boolean,
): (number | '...')[] {
  if (totalPages <= 1) return [1];

  if (isMobile) {
    // 모바일: 최대 5개 페이지 번호, 현재 페이지 중심 슬라이딩 윈도우
    const maxVisible = Math.min(5, totalPages);
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    // 끝에 도달하면 시작을 앞으로 조정
    start = Math.max(1, end - maxVisible + 1);

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  // Desktop/Tablet: 첫/끝 항상 표시 + 현재 ±2 siblings + 생략 부호
  const siblingCount = 2;
  const pages: (number | '...')[] = [];

  const rangeStart = Math.max(2, currentPage - siblingCount);
  const rangeEnd = Math.min(totalPages - 1, currentPage + siblingCount);

  // 첫 페이지
  pages.push(1);

  // 첫 페이지와 범위 사이에 간격이 있으면 생략 부호
  if (rangeStart > 2) {
    pages.push('...');
  }

  // 중간 범위
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i);
  }

  // 범위와 마지막 페이지 사이에 간격이 있으면 생략 부호
  if (rangeEnd < totalPages - 1) {
    pages.push('...');
  }

  // 마지막 페이지 (1페이지뿐이면 중복 방지)
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}

/** 페이지 번호 버튼 공통 스타일 */
const baseButtonStyle = cn(
  'inline-flex items-center justify-center rounded-md border transition-all duration-200',
  'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2',
  'dark:focus:ring-offset-neutral-800',
);

/** 활성 페이지 스타일 (FilterTabs 패턴과 일관) */
const activeStyle = cn(
  'bg-purple-100 dark:bg-purple-900/40',
  'text-purple-700 dark:text-purple-300',
  'border-purple-200 dark:border-purple-700',
  'shadow-sm',
);

/** 비활성 페이지 스타일 */
const inactiveStyle = cn(
  'bg-white dark:bg-neutral-800',
  'text-neutral-600 dark:text-neutral-300',
  'hover:bg-neutral-50 dark:hover:bg-neutral-700',
  'hover:text-neutral-900 dark:hover:text-neutral-50',
  'border-neutral-200 dark:border-neutral-700',
);

/** 비활성화된(disabled) 버튼 스타일 */
const disabledStyle = 'opacity-50 cursor-not-allowed pointer-events-none';

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className = '',
}) => {
  const isMobile = useIsMobile();

  const pageNumbers = useMemo(
    () => getPageNumbers(currentPage, totalPages, isMobile),
    [currentPage, totalPages, isMobile],
  );

  // 데이터가 없으면 페이지네이션 불필요
  if (totalCount === 0) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  // 페이지 사이즈 선택 드롭다운
  const pageSizeSelector = (
    <select
      value={pageSize}
      onChange={(e) => onPageSizeChange(Number(e.target.value))}
      className={cn(
        'rounded-md border px-2 py-1.5 text-xs sm:text-sm',
        'bg-white dark:bg-neutral-800',
        'text-neutral-600 dark:text-neutral-300',
        'border-neutral-200 dark:border-neutral-700',
        'focus:outline-none focus:ring-2 focus:ring-purple-500',
      )}
    >
      {PAGE_SIZE_OPTIONS.map((size) => (
        <option key={size} value={size}>
          {size}개씩
        </option>
      ))}
    </select>
  );

  // 이전/다음 버튼
  const prevButton = (
    <button
      onClick={() => hasPrev && onPageChange(currentPage - 1)}
      disabled={!hasPrev}
      aria-label="이전 페이지"
      className={cn(
        baseButtonStyle,
        'w-8 h-8 sm:w-9 sm:h-9',
        hasPrev ? inactiveStyle : disabledStyle,
        !hasPrev && 'border-neutral-200 dark:border-neutral-700',
      )}
    >
      <ChevronLeftIcon className="w-4 h-4" />
    </button>
  );

  const nextButton = (
    <button
      onClick={() => hasNext && onPageChange(currentPage + 1)}
      disabled={!hasNext}
      aria-label="다음 페이지"
      className={cn(
        baseButtonStyle,
        'w-8 h-8 sm:w-9 sm:h-9',
        hasNext ? inactiveStyle : disabledStyle,
        !hasNext && 'border-neutral-200 dark:border-neutral-700',
      )}
    >
      <ChevronRightIcon className="w-4 h-4" />
    </button>
  );

  // 페이지 번호 버튼들
  const pageButtons = pageNumbers.map((page, idx) =>
    page === '...' ? (
      <span
        key={`ellipsis-${idx}`}
        className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 text-neutral-400 dark:text-neutral-500 text-sm"
      >
        ...
      </span>
    ) : (
      <button
        key={page}
        onClick={() => onPageChange(page)}
        aria-label={`${page}페이지`}
        aria-current={page === currentPage ? 'page' : undefined}
        className={cn(
          baseButtonStyle,
          'w-8 h-8 sm:w-9 sm:h-9 text-xs sm:text-sm font-medium',
          page === currentPage ? activeStyle : inactiveStyle,
        )}
      >
        {page}
      </button>
    ),
  );

  if (isMobile) {
    // 모바일 레이아웃: 상단 - 이전/페이지번호/다음, 하단 - 페이지사이즈
    return (
      <div className={cn('flex flex-col items-center gap-3 mt-6', className)}>
        <div className="flex items-center gap-1">
          {prevButton}
          {pageButtons}
          {nextButton}
        </div>
        {pageSizeSelector}
      </div>
    );
  }

  // Desktop/Tablet 레이아웃: 왼쪽 페이지사이즈 | 중앙 페이지번호 | 오른쪽 총 개수
  return (
    <div
      className={cn(
        'flex items-center justify-between mt-6',
        className,
      )}
    >
      {/* 왼쪽: 페이지 사이즈 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">페이지당</span>
        {pageSizeSelector}
      </div>

      {/* 중앙: 페이지 번호 */}
      <div className="flex items-center gap-1">
        {prevButton}
        {pageButtons}
        {nextButton}
      </div>

      {/* 오른쪽: 총 개수 */}
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        총 {totalCount.toLocaleString()}개
      </span>
    </div>
  );
};
