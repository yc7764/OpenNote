"use client";

import { useQuota } from '@/hooks/useQuota';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface QuotaDisplayProps {
  collapsed?: boolean;
}

/**
 * 사용자 쿼터 현황 표시 컴포넌트
 *
 * - 일일 노트 생성 제한
 * - 스토리지 사용량
 * - 실시간 갱신 (30초 간격)
 * - collapsed 모드: 아이콘만 표시 (태블릿 사이드바용)
 */
export function QuotaDisplay({ collapsed = false }: QuotaDisplayProps) {
  const { quota, isLoading, isError } = useQuota();

  if (isLoading) {
    if (collapsed) {
      return (
        <div className="p-3 flex justify-center">
          <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
        </div>
      );
    }
    return (
      <div className="px-4 py-3 animate-pulse">
        <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-20 mb-2" />
        <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded w-full mb-3" />
        <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-16 mb-2" />
        <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded w-full" />
      </div>
    );
  }

  if (isError || !quota) {
    return null; // 에러 시 조용히 숨김
  }

  const dailyPercent = Math.min(100, (quota.daily.used / quota.daily.limit) * 100);
  const storagePercent = quota.storage.usage_percent;

  // 색상 결정 함수
  const getBarColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getTextColor = (percent: number) => {
    if (percent >= 90) return 'text-red-600 dark:text-red-400';
    if (percent >= 70) return 'text-amber-600 dark:text-amber-400';
    return 'text-neutral-600 dark:text-neutral-400';
  };

  const getRingColor = (percent: number) => {
    if (percent >= 90) return 'stroke-red-500';
    if (percent >= 70) return 'stroke-amber-500';
    return 'stroke-emerald-500';
  };

  // Collapsed view: circular progress indicator
  if (collapsed) {
    const avgPercent = (dailyPercent + storagePercent) / 2;
    const circumference = 2 * Math.PI * 16; // r=16
    const strokeDashoffset = circumference - (avgPercent / 100) * circumference;

    return (
      <div className="p-3 flex justify-center" title={`노트: ${quota.daily.remaining}회 남음 | 저장소: ${quota.storage.used_display}`}>
        <div className="relative w-10 h-10">
          {/* Background circle */}
          <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 40 40">
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-neutral-200 dark:text-neutral-700"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              className={getRingColor(avgPercent)}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className={cn('w-4 h-4', getTextColor(avgPercent))} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // Expanded view: full quota display
  return (
    <div className="px-4 py-3 space-y-3">
      {/* 일일 노트 제한 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            노트 생성 횟수
          </span>
          <span className={cn('text-xs font-semibold', getTextColor(dailyPercent))}>
            {quota.daily.remaining}회 남음
          </span>
        </div>
        <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-300', getBarColor(dailyPercent))}
            style={{ width: `${dailyPercent}%` }}
          />
        </div>
        {quota.daily.remaining <= 3 && quota.daily.remaining > 0 && (
          <p className="text-[10px] text-amber-500 dark:text-amber-400 mt-1">
            오늘 {quota.daily.remaining}회만 더 생성 가능
          </p>
        )}
        {quota.daily.remaining === 0 && (
          <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">
            내일 자정에 초기화됩니다
          </p>
        )}
      </div>

      {/* 스토리지 사용량 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            저장 공간
          </span>
          <span className={cn('text-xs font-semibold', getTextColor(storagePercent))}>
            {quota.storage.used_display} / {quota.storage.limit_display}
          </span>
        </div>
        <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-300', getBarColor(storagePercent))}
            style={{ width: `${storagePercent}%` }}
          />
        </div>
        {storagePercent >= 90 && (
          <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">
            저장 공간이 거의 가득 찼습니다
          </p>
        )}
      </div>

      {/* 플랜 표시 */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          {quota.plan_display} 플랜
        </span>
        {quota.plan === 'free' && (
          <button
            className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-medium"
            onClick={() => toast.info('업그레이드 기능은 추후 추가 예정입니다.')}
          >
            업그레이드
          </button>
        )}
      </div>
    </div>
  );
}
