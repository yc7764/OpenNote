/**
 * Exponential backoff 재시도 유틸
 * @param fn 실행할 비동기 함수
 * @param maxRetries 최대 재시도 횟수
 * @param baseDelayMs 기본 딜레이 (ms). 재시도마다 2배씩 증가
 */
export async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  // 타입 안전을 위한 unreachable
  throw new Error('retryWithDelay: unexpected exit');
}
