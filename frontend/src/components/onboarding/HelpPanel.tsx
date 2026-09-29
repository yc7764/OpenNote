'use client';

import React, { useState } from 'react';
import Modal from '@/components/common/Modal';
import { useOnboardingHints, useHelpPanel, useTour } from './OnboardingContext';
import {
  GUIDE_STEPS,
  GUIDE_CATEGORIES,
  groupStepsByCategory,
  type GuideCategory,
  type GuideStep,
} from './guideSteps';
import { useDeviceType, useIsMobileOrTablet } from '@/hooks/useMediaQuery';

/** 카테고리별 아이콘 */
function CategoryIcon({ category }: { category: GuideCategory }) {
  const iconClass = 'w-4 h-4';
  switch (category) {
    case 'stt':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      );
    case 'summary':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'speaker':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'audio':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'navigation':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
  }
}

/** 개별 가이드 항목 */
function GuideItem({ step }: { step: GuideStep }) {
  return (
    <div className="py-2.5 px-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
      <h4 className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-0.5">
        {step.title}
      </h4>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
        {step.description}
      </p>
    </div>
  );
}

/** 카테고리 아코디언 */
function CategorySection({
  category,
  steps,
  isOpen,
  onToggle,
}: {
  category: GuideCategory;
  steps: GuideStep[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const meta = GUIDE_CATEGORIES[category];

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3
                 bg-white dark:bg-neutral-800
                 hover:bg-neutral-50 dark:hover:bg-neutral-750
                 transition-colors text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-center justify-center w-7 h-7 rounded-lg
                      bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400
                      flex-shrink-0">
          <CategoryIcon category={category} />
        </div>
        <span className="flex-1 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          {meta.label}
        </span>
        <span className="text-xs text-neutral-400 dark:text-neutral-500 mr-1">
          {steps.length}
        </span>
        <svg
          className={`w-4 h-4 text-neutral-400 dark:text-neutral-500 transition-transform duration-200
                    ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-1 pb-2 bg-white dark:bg-neutral-800 border-t border-neutral-100 dark:border-neutral-700/50">
          {steps.map((step) => (
            <GuideItem key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 도움말 패널
 * - 모바일/태블릿: Modal(바텀시트)
 * - 데스크탑: Modal(중앙 다이얼로그)
 * - 카테고리별 아코디언으로 가이드 스텝 나열
 * - "온보딩 다시 보기" 버튼
 */
export default function HelpPanel() {
  const { isHelpPanelOpen, closeHelpPanel } = useHelpPanel();
  const { resetOnboarding } = useOnboardingHints();
  const { startTour } = useTour();
  const deviceType = useDeviceType();
  const isMobileOrTablet = useIsMobileOrTablet();

  // 카테고리 아코디언 상태 - 기본적으로 첫 번째만 열기
  const [openCategories, setOpenCategories] = useState<Set<GuideCategory>>(new Set(['stt']));

  // 현재 디바이스에 맞는 스텝만 필터
  const filteredSteps = GUIDE_STEPS.filter((step) => step.devices.includes(deviceType));
  const grouped = groupStepsByCategory(filteredSteps);

  // 존재하는 카테고리 순서
  const categoryOrder: GuideCategory[] = ['stt', 'summary', 'speaker', 'audio', 'navigation'];
  const availableCategories = categoryOrder.filter((cat) => grouped[cat]?.length > 0);

  const toggleCategory = (category: GuideCategory) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleStartTour = () => {
    closeHelpPanel();
    // 패널 닫히는 애니메이션 이후 투어 시작
    setTimeout(() => {
      startTour();
    }, 300);
  };

  const handleResetOnboarding = () => {
    closeHelpPanel();
    setTimeout(() => {
      resetOnboarding();
    }, 300);
  };

  return (
    <Modal
      open={isHelpPanelOpen}
      onClose={closeHelpPanel}
      title="사용법 안내"
      description="노트 상세 페이지의 주요 기능을 확인하세요."
      size={isMobileOrTablet ? 'full' : 'md'}
      variant="centered"
      forceBottomSheet={false}
      footer={
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={handleStartTour}
            className="flex-1 px-4 py-2 text-xs font-medium text-blue-600 dark:text-blue-400
                     bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800
                     rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40
                     focus:outline-none focus:ring-2 focus:ring-blue-400
                     transition-colors"
          >
            가이드 투어 시작
          </button>
          <button
            type="button"
            onClick={closeHelpPanel}
            className="flex-1 px-4 py-2 text-xs font-medium text-white
                     bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600
                     rounded-lg shadow-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                     dark:focus:ring-offset-neutral-800
                     transition-colors"
          >
            닫기
          </button>
        </div>
      }
    >
      <div className="space-y-2.5">
        {availableCategories.map((category) => (
          <CategorySection
            key={category}
            category={category}
            steps={grouped[category]}
            isOpen={openCategories.has(category)}
            onToggle={() => toggleCategory(category)}
          />
        ))}
      </div>
    </Modal>
  );
}
