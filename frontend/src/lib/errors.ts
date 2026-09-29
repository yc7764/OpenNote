/**
 * 에러 객체에서 사용자에게 보여줄 메시지를 안전하게 추출.
 * - Error 인스턴스: error.message
 * - DRF 응답 형태({ detail }, { error }): 해당 필드
 * - 그 외: fallback 사용
 */
export function getErrorMessage(error: unknown, fallback = '알 수 없는 오류가 발생했습니다.'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const obj = error as { detail?: unknown; error?: unknown; message?: unknown };
    if (typeof obj.detail === 'string') return obj.detail;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.message === 'string') return obj.message;
  }
  return fallback;
}
