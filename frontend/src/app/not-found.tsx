import Link from 'next/link';

/**
 * 전역 404 페이지
 *
 * 매칭되지 않는 라우트·notFound() 호출 시 표시되는 사이트 전역 404.
 * app/error.tsx(에러 바운더리)와 동일한 디자인 언어를 따른다.
 * 서버 컴포넌트 — 네비게이션은 next/link로 처리(클라이언트 JS 불필요).
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md text-center">
        {/* 아이콘 (검색 실패) */}
        <div className="w-20 h-20 mx-auto mb-6 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-indigo-600 dark:text-indigo-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>

        {/* 404 */}
        <p className="text-5xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">404</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
          <br />
          주소를 다시 확인해 주세요.
        </p>

        {/* 복구 */}
        <Link
          href="/"
          className="inline-block w-full bg-indigo-600 hover:bg-indigo-700
                     text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
