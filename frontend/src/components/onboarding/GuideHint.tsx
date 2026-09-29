'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { useOnboardingHints, useTour } from './OnboardingContext';
import { GUIDE_STEPS } from './guideSteps';
import { useDeviceType } from '@/hooks/useMediaQuery';

interface GuideHintProps {
  /** 가이드 스텝 ID (guideSteps.ts에 정의된 ID) */
  stepId: string;
  /** 추가 CSS 클래스 */
  className?: string;
}

/** DOM API로 안전하게 툴팁 콘텐츠 생성 */
function createTooltipContent(
  title: string,
  description: string,
  onDismiss: () => void
): HTMLDivElement {
  const box = document.createElement('div');
  box.className =
    'bg-white dark:bg-neutral-800 rounded-xl shadow-lg dark:shadow-black/50 ' +
    'border border-neutral-200 dark:border-neutral-700 ' +
    'ring-1 ring-black/5 dark:ring-white/10 ' +
    'p-4 max-w-[280px] z-tooltip';

  // 제목
  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'mb-2';
  const titleEl = document.createElement('h4');
  titleEl.className = 'text-sm font-semibold text-neutral-800 dark:text-neutral-100';
  titleEl.textContent = title;
  titleWrapper.appendChild(titleEl);
  box.appendChild(titleWrapper);

  // 설명
  const descEl = document.createElement('p');
  descEl.className = 'text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed mb-3';
  descEl.textContent = description;
  box.appendChild(descEl);

  // 확인 버튼
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'w-full px-3 py-1.5 text-xs font-medium text-white ' +
    'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 ' +
    'rounded-lg transition-colors ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ' +
    'dark:focus:ring-offset-neutral-800';
  btn.textContent = '확인';
  btn.addEventListener('click', onDismiss);
  box.appendChild(btn);

  return box;
}

/**
 * 가이드 힌트 컴포넌트
 * - pulsing dot 표시 → 클릭 시 tippy.js 툴팁으로 설명 표시
 * - 온보딩 context의 hintsActive 상태에 따라 표시/숨김
 * - 해제된 힌트는 다시 표시되지 않음
 * - 디바이스 타입에 따라 필터링
 */
export default function GuideHint({ stepId, className = '' }: GuideHintProps) {
  const { hintsActive, isHintDismissed, dismissHint } = useOnboardingHints();
  const { isTourActive } = useTour();
  const deviceType = useDeviceType();

  const dotRef = useRef<HTMLButtonElement>(null);
  const tippyRef = useRef<TippyInstance | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  // 가이드 스텝 데이터 조회
  const step = GUIDE_STEPS.find((s) => s.id === stepId);

  // 현재 디바이스에서 이 힌트를 표시해야 하는지 확인
  // 투어 진행 중에는 힌트 dot을 숨김
  const shouldShow =
    hintsActive &&
    !isTourActive &&
    step &&
    !isHintDismissed(stepId) &&
    step.devices.includes(deviceType);

  // 힌트 해제 핸들러
  const handleDismiss = useCallback(() => {
    if (tippyRef.current) {
      tippyRef.current.hide();
    }
    dismissHint(stepId);
  }, [dismissHint, stepId]);

  // tippy.js 초기화
  useEffect(() => {
    if (!dotRef.current || !step || !shouldShow) return;

    const instance = tippy(dotRef.current, {
      content: createTooltipContent(step.title, step.description, handleDismiss),
      trigger: 'click',
      interactive: true,
      placement: step.placement === 'auto' ? 'bottom' : step.placement,
      appendTo: () => document.body,
      maxWidth: 280,
      offset: [0, 8],
      animation: false,
      onShow() {
        setIsTooltipVisible(true);
      },
      onHide() {
        setIsTooltipVisible(false);
      },
    });

    tippyRef.current = instance;

    return () => {
      instance.destroy();
      tippyRef.current = null;
    };
  }, [step, shouldShow, handleDismiss]);

  // 표시하지 않아야 하면 렌더링 안 함
  if (!shouldShow || !step) return null;

  return (
    <button
      ref={dotRef}
      type="button"
      className={`
        relative inline-flex items-center justify-center
        w-4 h-4 flex-shrink-0
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
        dark:focus:ring-offset-neutral-800
        rounded-full
        ${className}
      `}
      aria-label={`${step.title} 사용법 안내`}
      aria-expanded={isTooltipVisible}
      aria-haspopup="dialog"
    >
      {/* 펄싱 외곽 원 (애니메이션) */}
      <span
        className="absolute inset-0 rounded-full bg-blue-400 dark:bg-blue-500 animate-pulse-hint"
        aria-hidden="true"
      />
      {/* 내부 점 */}
      <span
        className="relative w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400
                   ring-2 ring-white dark:ring-neutral-800"
        aria-hidden="true"
      />
    </button>
  );
}
