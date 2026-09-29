'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { cn } from '@/lib/utils';
import GuideHint from '@/components/onboarding/GuideHint';
import { useTour } from '@/components/onboarding/OnboardingContext';

interface NoteDetailLayoutProps {
  header: React.ReactNode;
  sttResults: React.ReactNode;
  summary: React.ReactNode;
  speakerTab: React.ReactNode;
  audioPlayer: React.ReactNode;
  isMobile?: boolean;
}

// 모바일 탭 타입 (3탭)
type MobileTabType = 'stt' | 'summary' | 'speaker';

// 데스크톱 우측 패널 탭 타입 (2탭)
type DesktopRightTabType = 'summary' | 'speaker';

const NoteDetailLayout: React.FC<NoteDetailLayoutProps> = ({
  header,
  sttResults,
  summary,
  speakerTab,
  audioPlayer,
}) => {
  const isMobile = useIsMobile();
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTabType>('stt');
  const [desktopRightTab, setDesktopRightTab] = useState<DesktopRightTabType>('summary');
  const [leftPanelWidth, setLeftPanelWidth] = useState(60); // 60% 기본값
  const [isResizing, setIsResizing] = useState(false);
  const { registerTabSwitcher, unregisterTabSwitcher } = useTour();

  // Load panel width from localStorage
  useEffect(() => {
    if (!isMobile) {
      const saved = localStorage.getItem('noteDetailLeftPanelWidth');
      if (saved) {
        const width = parseInt(saved, 10);
        if (width >= 40 && width <= 80) {
          setLeftPanelWidth(width);
        }
      }
    }
  }, [isMobile]);

  // 투어에서 탭 전환을 위한 콜백 등록
  useEffect(() => {
    registerTabSwitcher({
      setMobileTab: setMobileActiveTab,
      setDesktopRightTab,
    });
    return () => {
      unregisterTabSwitcher();
    };
  }, [registerTabSwitcher, unregisterTabSwitcher]);

  // Resizer drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing || isMobile) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerWidth = window.innerWidth;
      const newLeftWidth = (e.clientX / containerWidth) * 100;

      // 40% ~ 80% 범위로 제한
      if (newLeftWidth >= 40 && newLeftWidth <= 80) {
        setLeftPanelWidth(newLeftWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('noteDetailLeftPanelWidth', String(Math.round(leftPanelWidth)));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, isMobile, leftPanelWidth]);

  // 모바일에서 3탭 간 스와이프 이동
  const handleSwipeLeft = useCallback(() => {
    setMobileActiveTab((prev) => {
      if (prev === 'stt') return 'summary';
      if (prev === 'summary') return 'speaker';
      return prev;
    });
  }, []);

  const handleSwipeRight = useCallback(() => {
    setMobileActiveTab((prev) => {
      if (prev === 'speaker') return 'summary';
      if (prev === 'summary') return 'stt';
      return prev;
    });
  }, []);

  // Swipe gesture for tab switching on mobile
  const swipeRef = useSwipeGesture<HTMLDivElement>(
    {
      onSwipeLeft: handleSwipeLeft,
      onSwipeRight: handleSwipeRight,
    },
    { threshold: 50 }
  );

  // 탭 위치 계산 (3탭 시스템)
  const getTabTransform = (tab: MobileTabType): string => {
    const tabOrder: MobileTabType[] = ['stt', 'summary', 'speaker'];
    const currentIndex = tabOrder.indexOf(mobileActiveTab);
    const tabIndex = tabOrder.indexOf(tab);
    const offset = (tabIndex - currentIndex) * 100;
    return `translateX(${offset}%)`;
  };

  // Mobile layout with 3 tabs
  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden bg-white dark:bg-neutral-900 transition-colors duration-200">
        {header}

        {/* Tab Header (3탭) */}
        <div className="flex items-center border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800" data-tour-target="tab-nav-mobile">
          <GuideHint stepId="tab-nav-mobile" className="ml-3" />
          <button
            onClick={() => setMobileActiveTab('stt')}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors relative',
              mobileActiveTab === 'stt'
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
            )}
          >
            녹음 내용
            {mobileActiveTab === 'stt' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
            )}
          </button>
          <button
            onClick={() => setMobileActiveTab('summary')}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors relative',
              mobileActiveTab === 'summary'
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
            )}
          >
            요약
            {mobileActiveTab === 'summary' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
            )}
          </button>
          <button
            onClick={() => setMobileActiveTab('speaker')}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors relative',
              mobileActiveTab === 'speaker'
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
            )}
          >
            화자
            {mobileActiveTab === 'speaker' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
            )}
          </button>
        </div>

        {/* Tab Content with swipe - pb-16 for audio player space */}
        <div
          ref={swipeRef}
          className="flex-1 overflow-hidden relative pb-16"
        >
          {/* STT Results Panel */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out"
            style={{ transform: getTabTransform('stt') }}
          >
            <div className="h-full overflow-auto pb-16 scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
              {sttResults}
            </div>
          </div>

          {/* Summary Panel */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out"
            style={{ transform: getTabTransform('summary') }}
          >
            <div className="h-full overflow-auto pb-16 scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
              {summary}
            </div>
          </div>

          {/* Speaker Panel */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out"
            style={{ transform: getTabTransform('speaker') }}
          >
            <div className="h-full overflow-auto pb-16 scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
              {speakerTab}
            </div>
          </div>
        </div>

        {/* Audio Player - fixed with safe area */}
        <div className="fixed bottom-0 left-0 right-0 pb-safe-bottom z-50">
          {audioPlayer}
        </div>
      </div>
    );
  }

  // Desktop/Tablet layout
  return (
    <div className="flex flex-col h-[calc(100vh-126px)] desktop:h-[calc(100vh-78px)] overflow-hidden bg-white dark:bg-neutral-900 transition-colors duration-200">
      {header}

      <div className="flex flex-1 min-h-0 overflow-hidden border-t border-neutral-200 dark:border-neutral-700">
        {/* STT Results Panel */}
        <div
          className="flex flex-col overflow-hidden min-w-0"
          style={{ width: `${leftPanelWidth}%` }}
        >
          {sttResults}
        </div>

        {/* Resizer */}
        <div
          className={cn(
            'w-1 hover:w-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-primary-500 dark:hover:bg-primary-600',
            'cursor-col-resize transition-all flex-shrink-0 relative group',
            isResizing && 'bg-primary-500 dark:bg-primary-600 w-1.5'
          )}
          onMouseDown={handleMouseDown}
        >
          {/* Resizer handle (visible on hover) */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="absolute inset-y-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-primary-500 dark:bg-primary-600 rounded-full" />
          </div>
        </div>

        {/* Right Panel with Tabs */}
        <div
          className="flex flex-col overflow-hidden min-w-[280px] min-h-0"
          style={{ width: `${100 - leftPanelWidth}%` }}
        >
          {/* Tab Header */}
          <div className="flex items-center border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex-shrink-0" data-tour-target="tab-nav-desktop">
            <GuideHint stepId="tab-nav-desktop" className="ml-3" />
            <button
              onClick={() => setDesktopRightTab('summary')}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium transition-colors relative',
                desktopRightTab === 'summary'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              )}
            >
              요약
              {desktopRightTab === 'summary' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
              )}
            </button>
            <button
              onClick={() => setDesktopRightTab('speaker')}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium transition-colors relative',
                desktopRightTab === 'speaker'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              )}
            >
              화자
              {desktopRightTab === 'speaker' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden relative min-h-0">
            {desktopRightTab === 'summary' && (
              <div className="absolute inset-0">
                <div className="h-full overflow-auto scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
                  {summary}
                </div>
              </div>
            )}
            {desktopRightTab === 'speaker' && (
              <div className="absolute inset-0">
                <div className="h-full overflow-auto scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
                  {speakerTab}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audio Player - fixed */}
      <div className="fixed bottom-0 left-0 tablet:left-16 desktop:left-64 right-0">
        {audioPlayer}
      </div>
    </div>
  );
};

export default NoteDetailLayout;
