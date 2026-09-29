'use client';

import React from 'react';
import Modal from '@/components/common/Modal';
import { useOnboardingHints } from './OnboardingContext';
import { GUIDE_CATEGORIES, type GuideCategory } from './guideSteps';

/** 환영 모달에서 미리보기로 보여줄 카테고리 목록 */
const PREVIEW_CATEGORIES: { category: GuideCategory; description: string }[] = [
  { category: 'stt', description: '텍스트 편집 및 화자 변경' },
  { category: 'summary', description: '키워드, 할 일, 요약 편집' },
  { category: 'speaker', description: '화자 이름 편집, 병합, 발화 확인' },
  { category: 'audio', description: '타임스탬프로 구간 재생' },
];

/** 카테고리별 SVG 아이콘 */
function CategoryIcon({ category }: { category: GuideCategory }) {
  switch (category) {
    case 'stt':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      );
    case 'summary':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'speaker':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'audio':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * 첫 방문 환영 모달
 * - 기존 Modal 컴포넌트 활용 (모바일: 자동 바텀시트)
 * - "기능 둘러보기" 선택 시 힌트 활성화
 * - "건너뛰기" 선택 시 힌트 없이 닫기
 */
export default function WelcomeModal() {
  const { hasSeenWelcome, completeWelcomeWithTour, skipWelcome } = useOnboardingHints();

  if (hasSeenWelcome) return null;

  return (
    <Modal
      open={!hasSeenWelcome}
      onClose={skipWelcome}
      size="md"
      variant="centered"
      showCloseButton={false}
      closeOnOverlayClick={false}
      closeOnEscape={false}
      footer={
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={skipWelcome}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-neutral-600 dark:text-neutral-400
                     bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600
                     rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700
                     focus:outline-none focus:ring-2 focus:ring-neutral-400
                     transition-colors"
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={completeWelcomeWithTour}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white
                     bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600
                     rounded-lg shadow-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                     dark:focus:ring-offset-neutral-800
                     transition-colors"
          >
            기능 둘러보기
          </button>
        </div>
      }
    >
      <div className="text-center">
        {/* 아이콘 */}
        <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full
                      bg-blue-50 dark:bg-blue-900/30 mb-4">
          <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {/* 제목 */}
        <h2 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-2">
          노트를 더 효과적으로 활용하세요
        </h2>

        {/* 설명 */}
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
          주요 기능을 간단히 안내해 드릴게요.
          <br />
          각 기능 옆의 안내 표시를 클릭하면 사용법을 확인할 수 있습니다.
        </p>

        {/* 기능 미리보기 목록 */}
        <div className="space-y-2.5 text-left">
          {PREVIEW_CATEGORIES.map(({ category, description }) => {
            const meta = GUIDE_CATEGORIES[category];
            return (
              <div
                key={category}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg
                         bg-neutral-50 dark:bg-neutral-800/50
                         border border-neutral-100 dark:border-neutral-700/50"
              >
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                              bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300
                              shadow-xs dark:shadow-none">
                  <CategoryIcon category={category} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    {meta.label}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
