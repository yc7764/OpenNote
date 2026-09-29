'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Notes 섹션 Error Boundary
 *
 * 노트 관련 페이지에서 발생하는 오류를 처리합니다.
 * 노트 로딩 실패, 권한 오류 등에 대한 사용자 친화적인 메시지를 표시합니다.
 *
 * 보안: 오류 세부 정보는 사용자에게 노출되지 않습니다.
 */
export default function NotesError({ error, reset }: ErrorProps) {
  const router = useRouter();

  useEffect(() => {
    // 프로덕션에서는 오류 모니터링 서비스로 전송
    if (process.env.NODE_ENV === 'development') {
      // Development only - error details for debugging
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md text-center">
        {/* 노트 오류 아이콘 */}
        <div className="w-20 h-20 mx-auto mb-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-amber-600 dark:text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>

        {/* 오류 메시지 */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          노트를 불러올 수 없습니다
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          노트를 로드하는 중 오류가 발생했습니다.
          <br />
          네트워크 연결을 확인하고 다시 시도해 주세요.
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
            onClick={() => router.push('/dashboard')}
            className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
                       text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-lg
                       transition-colors"
          >
            대시보드로 돌아가기
          </button>

          <button
            onClick={() => router.back()}
            className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300
                       font-medium py-2 transition-colors"
          >
            이전 페이지로
          </button>
        </div>

        {/* 오류 ID */}
        {error.digest && (
          <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
            오류 ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
