'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/common/ThemeToggle';

export default function AboutPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">돌아가기</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            OpenNote 소개
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            AI 기반 음성 노트 서비스
          </p>
        </div>

        {/* Content */}
        <div className="space-y-10">
          {/* 서비스 소개 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              서비스 소개
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>
                OpenNote는 AI 기반의 음성 노트 서비스입니다.
                음성 파일을 업로드하면 자동으로 텍스트로 변환(STT)하고,
                AI가 내용을 분석하여 요약을 생성해드립니다.
              </p>
              <p className="bg-indigo-50/50 dark:bg-indigo-900/10 px-4 py-3 -mx-4">
                본 서비스는 <strong className="text-indigo-700 dark:text-indigo-400">비영리 연구 및 공익 목적</strong>으로
                운영되며, 모든 기능을 무료로 제공합니다.
              </p>
            </div>
          </section>

          {/* 주요 기능 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              주요 기능
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ul className="list-disc list-outside ml-5 space-y-2">
                <li><strong>음성 녹음 및 업로드</strong>: 직접 녹음하거나 음성 파일을 업로드할 수 있습니다.</li>
                <li><strong>음성 인식 (STT)</strong>: 오픈소스 AI 모델을 활용하여 음성을 텍스트로 변환합니다.</li>
                <li><strong>AI 요약</strong>: 변환된 텍스트를 AI가 분석하여 핵심 내용을 요약합니다.</li>
                <li><strong>노트 관리</strong>: 생성된 노트를 조회, 수정, 삭제, 즐겨찾기할 수 있습니다.</li>
              </ul>
            </div>
          </section>

          {/* 문의하기 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              문의하기
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>
                서비스 이용 중 문의사항이나 버그 발견 시 문의하기 페이지를 이용하시거나 아래 이메일로 연락해주세요.
              </p>
              <div className="bg-gray-100/50 dark:bg-gray-800/50 px-4 py-4 -mx-4 rounded-lg">
                <div className="space-y-4">
                  {/* 문의하기 페이지 링크 */}
                  <Link
                    href="/contact"
                    className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    문의하기 페이지로 이동 (로그인 필요)
                  </Link>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">일반 문의 / 버그 신고</p>
                        <a
                          href="mailto:dudcjf7764@naver.com"
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        >
                          dudcjf7764@naver.com
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 기여자 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              기여자
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>OpenNote 개발에 도움을 주신 분들입니다.</p>
              <div className="bg-gray-100/50 dark:bg-gray-800/50 px-4 py-4 -mx-4 rounded-lg">
                <div className="flex flex-col gap-2">
                  <a href="mailto:kunj0312@gmail.com" className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    kunj0312@gmail.com
                  </a>
                  <a href="mailto:ybhicsa@gmail.com" className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    ybhicsa@gmail.com
                  </a>
                  <a href="mailto:ated808hack@gmail.com" className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    ated808hack@gmail.com
                  </a>
                  <a href="mailto:devchoi9261@gmail.com" className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    devchoi9261@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* 기술 정보 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              기술 정보
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ul className="list-disc list-outside ml-5 space-y-2">
                <li>오픈소스 AI 모델을 직접 학습하여 활용합니다.</li>
                <li>사용자 데이터는 AI 모델 학습에 사용되지 않습니다.</li>
                <li>모든 통신은 HTTPS로 암호화됩니다.</li>
              </ul>
            </div>
          </section>

          {/* 개발 블로그 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              개발 블로그
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>OpenNote 개발 과정과 관련 기술에 대한 글을 읽어보세요.</p>
              <a
                href="https://yc7764.tistory.com/category/OpenNote"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline font-medium break-all sm:break-normal"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span className="sm:hidden">개발 블로그 바로가기</span>
                <span className="hidden sm:inline">yc7764.tistory.com/category/OpenNote</span>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            OpenNote를 이용해 주셔서 감사합니다.
          </p>
        </div>

        {/* Additional Links */}
        <div className="flex flex-col items-center gap-3 mt-8 text-sm">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <Link href="/faq" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              FAQ
            </Link>
            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">•</span>
            <Link href="/terms" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              이용약관
            </Link>
            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">•</span>
            <Link href="/privacy" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              개인정보처리방침
            </Link>
            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">•</span>
            <Link href="/" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              로그인
            </Link>
          </div>
          <a href="mailto:dudcjf7764@naver.com" className="text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400">
            dudcjf7764@naver.com
          </a>
        </div>
      </main>
    </div>
  );
}
