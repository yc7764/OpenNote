'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTour } from './OnboardingContext';
import { TOUR_STEP_META } from './tourSteps';
import TourDemoAnimation from './TourDemoAnimation';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_GAP = 12;
const SCROLL_DELAY = 350;
const REPOSITION_DEBOUNCE = 100;

/**
 * 가이드 투어 메인 컴포넌트
 * 스포트라이트 오버레이 + 툴팁 + 데모 애니메이션 + 내비게이션
 */
export default function GuidedTour() {
  const {
    isTourActive,
    currentStepIndex,
    tourSteps,
    nextStep,
    prevStep,
    skipTour,
  } = useTour();

  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const repositionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 클라이언트 마운트 확인 (portal 용)
  useEffect(() => {
    setMounted(true);
  }, []);

  const currentStep = tourSteps[currentStepIndex];
  const stepMeta = currentStep ? TOUR_STEP_META[currentStep.id] : null;

  /** 대상 요소 찾기 + 스크롤 + 위치 계산 */
  const positionSpotlight = useCallback(() => {
    if (!currentStep) {
      setSpotlightRect(null);
      return;
    }

    const targetEl = document.querySelector(
      `[data-tour-target="${currentStep.id}"]`
    ) as HTMLElement | null;

    if (!targetEl) {
      // 대상 못 찾으면 자동 스킵
      nextStep();
      return;
    }

    // navigation 패널(탭 네비게이션)은 이미 화면 상단에 고정되어 있으므로
    // 중앙 정렬하지 않고 nearest로 처리 (불필요한 스크롤 방지)
    const isNavigationPanel = stepMeta?.panel === 'navigation';
    const scrollBehavior = isNavigationPanel ? 'nearest' : 'center';

    targetEl.scrollIntoView({ behavior: 'smooth', block: scrollBehavior as ScrollLogicalPosition });

    // 스크롤 후 위치 계산
    setTimeout(() => {
      const rect = targetEl.getBoundingClientRect();
      const spotlight: SpotlightRect = {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      };
      setSpotlightRect(spotlight);
      computeTooltipPosition(spotlight);
      setIsTransitioning(false);
    }, SCROLL_DELAY);
  }, [currentStep, nextStep, stepMeta]);

  /** 툴팁 위치 계산 */
  const computeTooltipPosition = useCallback(
    (spotlight: SpotlightRect, actualHeight?: number) => {
      if (!currentStep) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // 모바일에서 더 안전한 마진 적용
      const horizontalMargin = 16;
      const verticalMargin = 16;
      const tooltipWidth = Math.min(320, vw - horizontalMargin * 2);
      // 실제 높이가 제공되면 사용, 아니면 추정값 사용 (여유있게 설정)
      const tooltipHeight = actualHeight || 350;

      let placement = currentStep.placement || 'bottom';

      // 모바일에서는 left/right를 bottom으로 강제 변경 (좌우 공간 부족)
      if (vw < 640 && (placement === 'left' || placement === 'right')) {
        placement = 'bottom';
      }

      const style: React.CSSProperties = {
        position: 'fixed',
        zIndex: 1070,
        width: tooltipWidth,
        maxWidth: `calc(100vw - ${horizontalMargin * 2}px)`,
      };

      // 기본 배치: bottom → 공간 부족 시 top → 그래도 부족 시 강제 bottom
      const spaceBelow = vh - (spotlight.top + spotlight.height + TOOLTIP_GAP);
      const spaceAbove = spotlight.top - TOOLTIP_GAP;

      let effectivePlacement = placement;
      if (effectivePlacement === 'bottom' && spaceBelow < tooltipHeight && spaceAbove > spaceBelow) {
        effectivePlacement = 'top';
      } else if (effectivePlacement === 'top' && spaceAbove < tooltipHeight && spaceBelow > spaceAbove) {
        effectivePlacement = 'bottom';
      }

      // 수평 중앙 정렬 (뷰포트 내)
      let leftPos = spotlight.left + spotlight.width / 2 - tooltipWidth / 2;
      // 좌우 마진을 확실히 보장
      leftPos = Math.max(horizontalMargin, Math.min(leftPos, vw - tooltipWidth - horizontalMargin));

      switch (effectivePlacement) {
        case 'top':
          {
            let bottomPos = vh - spotlight.top + TOOLTIP_GAP;
            // 상단 마진 확보: 툴팁 상단이 화면 위로 나가지 않도록
            const maxBottom = vh - verticalMargin - tooltipHeight;
            bottomPos = Math.min(bottomPos, maxBottom);
            style.bottom = Math.max(verticalMargin, bottomPos);
            style.left = leftPos;
          }
          break;
        case 'left':
          {
            // 수직 중앙 정렬 후 상하 경계 체크
            let topPos = spotlight.top + spotlight.height / 2 - tooltipHeight / 2;
            topPos = Math.max(verticalMargin, Math.min(topPos, vh - verticalMargin - tooltipHeight));
            style.top = topPos;
            style.right = vw - spotlight.left + TOOLTIP_GAP;
          }
          break;
        case 'right':
          {
            // 수직 중앙 정렬 후 상하 경계 체크
            let topPos = spotlight.top + spotlight.height / 2 - tooltipHeight / 2;
            topPos = Math.max(verticalMargin, Math.min(topPos, vh - verticalMargin - tooltipHeight));
            style.top = topPos;
            style.left = spotlight.left + spotlight.width + TOOLTIP_GAP;
          }
          break;
        case 'bottom':
        default:
          {
            let topPos = spotlight.top + spotlight.height + TOOLTIP_GAP;
            // 하단 마진 확보: 툴팁 하단이 화면 아래로 나가지 않도록
            const maxTop = vh - verticalMargin - tooltipHeight;
            topPos = Math.min(topPos, maxTop);
            style.top = Math.max(verticalMargin, topPos);
            style.left = leftPos;
          }
          break;
      }

      setTooltipStyle(style);
    },
    [currentStep]
  );

  // 스텝 변경 시 스포트라이트 재계산
  useEffect(() => {
    if (!isTourActive || !currentStep) return;
    setIsTransitioning(true);
    // 탭 전환은 이미 OnboardingContext에서 완료됨
    // DOM 리렌더링과 레이아웃 안정화를 위한 최소 대기
    const isNavigationPanel = stepMeta?.panel === 'navigation';
    const delay = isNavigationPanel ? 150 : 100;
    const timer = setTimeout(() => {
      positionSpotlight();
    }, delay);
    return () => clearTimeout(timer);
  }, [isTourActive, currentStepIndex, currentStep, positionSpotlight, stepMeta]);

  // 툴팁 렌더링 후 실제 높이로 위치 재조정
  useEffect(() => {
    if (!isTourActive || !spotlightRect || !tooltipRef.current) return;

    // 툴팁이 완전히 렌더링된 후 실제 높이 측정
    const timer = setTimeout(() => {
      if (tooltipRef.current && spotlightRect) {
        const actualHeight = tooltipRef.current.offsetHeight;
        computeTooltipPosition(spotlightRect, actualHeight);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isTourActive, spotlightRect, computeTooltipPosition, currentStepIndex]);

  // resize / scroll 이벤트 디바운스로 재계산
  useEffect(() => {
    if (!isTourActive) return;

    const handleReposition = () => {
      if (repositionTimerRef.current) {
        clearTimeout(repositionTimerRef.current);
      }
      repositionTimerRef.current = setTimeout(() => {
        positionSpotlight();
      }, REPOSITION_DEBOUNCE);
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      if (repositionTimerRef.current) {
        clearTimeout(repositionTimerRef.current);
      }
    };
  }, [isTourActive, positionSpotlight]);

  // ESC 키로 투어 종료
  useEffect(() => {
    if (!isTourActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTour();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTourActive, skipTour]);

  if (!mounted || !isTourActive || !currentStep || !stepMeta) return null;

  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === tourSteps.length - 1;

  const content = (
    <>
      {/* 스포트라이트 오버레이 */}
      <div
        className="fixed inset-0 z-[1060] pointer-events-auto animate-tour-spotlight-appear"
        onClick={(e) => {
          // 오버레이 클릭 차단 (투어 영역 외)
          e.stopPropagation();
        }}
        style={{
          // 스포트라이트 구멍: 대상 영역만 투명하게
          ...(spotlightRect
            ? {
                background: 'transparent',
                boxShadow: `
                  ${spotlightRect.left}px 0 0 0 rgba(0,0,0,0.5),
                  -${window.innerWidth - spotlightRect.left - spotlightRect.width}px 0 0 0 rgba(0,0,0,0.5),
                  0 ${spotlightRect.top}px 0 0 rgba(0,0,0,0.5),
                  0 -${window.innerHeight - spotlightRect.top - spotlightRect.height}px 0 0 rgba(0,0,0,0.5),
                  0 0 0 9999px rgba(0,0,0,0.5)
                `,
                clipPath: `polygon(
                  0% 0%, 0% 100%,
                  ${spotlightRect.left}px 100%,
                  ${spotlightRect.left}px ${spotlightRect.top}px,
                  ${spotlightRect.left + spotlightRect.width}px ${spotlightRect.top}px,
                  ${spotlightRect.left + spotlightRect.width}px ${spotlightRect.top + spotlightRect.height}px,
                  ${spotlightRect.left}px ${spotlightRect.top + spotlightRect.height}px,
                  ${spotlightRect.left}px 100%,
                  100% 100%, 100% 0%
                )`,
              }
            : {
                background: 'rgba(0,0,0,0.5)',
              }),
          transition: 'all 0.3s ease-out',
        }}
      />

      {/* 스포트라이트 구멍 (클릭 차단 — 투어 중 요소 조작 방지) */}
      {spotlightRect && (
        <div
          className="fixed z-[1061] pointer-events-auto rounded-lg cursor-default"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.5)',
            transition: 'all 0.3s ease-out',
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}

      {/* 툴팁 */}
      {spotlightRect && !isTransitioning && (
        <div
          ref={tooltipRef}
          className="fixed z-[1070] animate-tour-tooltip-enter"
          style={tooltipStyle}
        >
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl dark:shadow-dark-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            {/* 헤더: 진행 표시 */}
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {currentStepIndex + 1} / {tourSteps.length}
              </span>
              <button
                onClick={skipTour}
                className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                건너뛰기
              </button>
            </div>

            {/* 진행 바 */}
            <div className="mx-4 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{
                  width: `${((currentStepIndex + 1) / tourSteps.length) * 100}%`,
                }}
              />
            </div>

            {/* 제목 + 설명 */}
            <div className="px-4 pt-3 pb-2">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 mb-1">
                {currentStep.title}
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {currentStep.description}
              </p>
            </div>

            {/* 데모 애니메이션 */}
            <TourDemoAnimation type={stepMeta.animationType} />

            {/* 내비게이션 */}
            <div className="flex items-center justify-between px-4 pb-3 pt-1">
              <button
                onClick={prevStep}
                disabled={isFirst}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300
                         bg-neutral-100 dark:bg-neutral-700 rounded-lg
                         hover:bg-neutral-200 dark:hover:bg-neutral-600
                         disabled:opacity-30 disabled:cursor-not-allowed
                         transition-colors"
              >
                이전
              </button>
              <button
                onClick={nextStep}
                className="px-4 py-1.5 text-xs font-medium text-white
                         bg-blue-600 hover:bg-blue-700 rounded-lg
                         transition-colors shadow-sm"
              >
                {isLast ? '완료' : '다음'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(content, document.body);
}
