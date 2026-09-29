/**
 * 사용자 쿼터 관련 타입 정의
 */

interface QuotaDaily {
  limit: number;
  used: number;
  remaining: number;
  reset_date: string;
  reset_at: string;
}

interface QuotaStorage {
  limit_bytes: number;
  used_bytes: number;
  remaining_bytes: number;
  usage_percent: number;
  limit_display: string;
  used_display: string;
  remaining_display: string;
}

export interface UserQuota {
  plan: 'free' | 'basic' | 'pro';
  plan_display: string;
  daily: QuotaDaily;
  storage: QuotaStorage;
}

export interface QuotaError {
  error: string;
  code: 'DAILY_LIMIT_EXCEEDED' | 'STORAGE_LIMIT_EXCEEDED';
  daily_limit?: number;
  daily_used?: number;
  storage_limit_bytes?: number;
  storage_used_bytes?: number;
}

/**
 * 에러가 쿼터 관련 에러인지 확인하는 타입 가드
 * @param error - 확인할 에러 객체
 * @returns error가 QuotaError 타입인 경우 true
 */
export function isQuotaError(error: unknown): error is QuotaError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    ['DAILY_LIMIT_EXCEEDED', 'STORAGE_LIMIT_EXCEEDED'].includes(
      (error as Record<string, unknown>).code as string
    )
  );
}
