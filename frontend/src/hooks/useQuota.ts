"use client";

import useSWR from 'swr';
import { fetchQuota } from '@/services/auth';
import type { UserQuota } from '@/types/quota';

/**
 * 사용자 쿼터 정보를 실시간으로 가져오는 훅
 *
 * - 30초마다 자동 갱신
 * - 노트 생성 후 mutate()로 즉시 갱신 가능
 * - 포커스 복귀 시 자동 재검증
 */
export function useQuota() {
  const { data, error, isLoading, mutate } = useSWR<UserQuota>(
    '/api/accounts/quota/',
    fetchQuota,
    {
      refreshInterval: 30000, // 30초마다 자동 갱신
      revalidateOnFocus: true, // 탭 포커스 시 재검증
      dedupingInterval: 5000, // 5초 내 중복 요청 방지
      errorRetryCount: 2,
    }
  );

  return {
    quota: data,
    isLoading,
    isError: !!error,
    error,
    refresh: mutate, // 수동 갱신용
  };
}
