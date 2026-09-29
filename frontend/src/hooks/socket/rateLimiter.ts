import { toast } from 'sonner';

// Rate Limiting 설정
export const RATE_LIMIT_CONFIG = {
  LIMIT: 60,           // 분당 최대 요청 수
  WINDOW_MS: 60 * 1000, // 1분 윈도우
};

/**
 * Sliding Window Rate Limiter 생성
 * - 1분 내 요청 수를 추적
 * - 제한 초과 시 경고 토스트 표시
 */
export function createRateLimiter(
  timestampsRef: React.MutableRefObject<number[]>
) {
  return (): boolean => {
    const now = Date.now();

    // 윈도우 기간 이내 요청만 유지
    timestampsRef.current = timestampsRef.current.filter(
      ts => now - ts < RATE_LIMIT_CONFIG.WINDOW_MS
    );

    if (timestampsRef.current.length >= RATE_LIMIT_CONFIG.LIMIT) {
      toast.warning('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      return false;
    }

    timestampsRef.current.push(now);
    return true;
  };
}
