'use client';

import React from 'react';
import { useHelpPanel } from './OnboardingContext';

/**
 * 헤더용 도움말 ? 버튼
 * 클릭 시 도움말 패널을 열어 모든 기능 안내를 확인할 수 있다.
 */
export default function HelpButton() {
  const { openHelpPanel } = useHelpPanel();

  return (
    <button
      type="button"
      onClick={openHelpPanel}
      className="p-1.5 rounded-md transition-all
               hover:bg-neutral-100 dark:hover:bg-neutral-800
               text-neutral-500 dark:text-neutral-400
               hover:text-neutral-700 dark:hover:text-neutral-200
               focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label="사용법 도움말"
      title="사용법 도움말"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  );
}
