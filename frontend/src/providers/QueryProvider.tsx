"use client";
import { SWRConfig } from 'swr';
import { apiClient, ApiError } from '@/lib/apiClient';
import { toast } from 'sonner';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher: (url: string) => apiClient(url),
      // 네트워크 오류 시 자동 재시도 활성화
      shouldRetryOnError: true,
      // 재시도 횟수: 3회
      errorRetryCount: 3,
      // 재시도 간격: 지수 백오프 (1초, 2초, 4초...)
      errorRetryInterval: 1000,
      // 탭 포커스 시 재검증 비활성화 (불필요한 요청 방지)
      revalidateOnFocus: false,
      onError: (err: unknown) => {
        if (typeof window === 'undefined') return;

        // ApiError 클래스 인스턴스 체크
        if (err instanceof ApiError) {
          // 401 에러는 apiClient에서 이미 처리 (리다이렉트)
          if (err.isUnauthorized()) return;

          // 서버 에러는 일반 메시지
          if (err.isServerError()) {
            toast.error('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            return;
          }

          // detail이 있으면 표시
          if (err.detail) {
            toast.error(err.detail);
            return;
          }
        }

        // TypeError는 네트워크 오류
        if (err instanceof TypeError) {
          toast.error('네트워크 연결을 확인해주세요.');
          return;
        }

        // 기타 에러
        const message = (err as { message?: string })?.message || '요청 처리 중 오류가 발생했습니다.';
        toast.error(message);
      }
    }}>
      {children}
    </SWRConfig>
  );
}
