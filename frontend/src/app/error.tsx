'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 전역 Error Boundary
 *
 * React 오류 발생 시 사용자에게 친화적인 오류 메시지를 표시하고
 * 복구 옵션을 제공합니다.
 *
 * 보안: 오류 세부 정보는 사용자에게 노출되지 않습니다.
 */
export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // 프로덕션에서는 오류 모니터링 서비스(예: Sentry)로 전송
    // 개발 환경에서만 콘솔 출력을 허용하려면 조건부 처리 가능
    if (process.env.NODE_ENV === 'development') {
      // Development only - error details for debugging
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md text-center">
        {/* 오류 아이콘 */}
        <div className="w-20 h-20 mx-auto mb-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-red-600 dark:text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* 오류 메시지 */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          문제가 발생했습니다
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          죄송합니다. 예상치 못한 오류가 발생했습니다.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>

        {/* 복구 버튼들 */}
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full bg-indigo-600 hover:bg-indigo-700
                       text-white font-semibold py-3 px-4 rounded-lg
                       transition-colors"
          >
            다시 시도
          </button>

          <button
            onClick={() => window.location.href = '/dashboard'}
            className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
                       text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-lg
                       transition-colors"
          >
            대시보드로 이동
          </button>
        </div>

        {/* 오류 ID (디버깅용, 민감 정보 미포함) */}
        {error.digest && (
          <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
            오류 ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
