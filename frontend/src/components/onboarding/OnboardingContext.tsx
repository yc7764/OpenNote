'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION, getStepsForPage, type GuideStep } from './guideSteps';
import { TOUR_STEP_META } from './tourSteps';
import { useDeviceType } from '@/hooks/useMediaQuery';

interface OnboardingState {
  version: number;
  hasSeenWelcome: boolean;
  dismissedHints: string[];
  lastSeenAt: string;
}

/** 탭 전환 콜백 인터페이스 (NoteDetailLayout이 등록) */
export interface TabSwitcher {
  setMobileTab: (tab: 'stt' | 'summary' | 'speaker') => void;
  setDesktopRightTab: (tab: 'summary' | 'speaker') => void;
}

// === 분리된 Context 3종 ===
// 1) HintsContext: 환영 모달, 힌트 해제 상태 (변경 빈도 낮음)
// 2) HelpPanelContext: 도움말 패널 열림 (변경 빈도 낮음)
// 3) TourContext: 가이드 투어 활성 상태 / 현재 스텝 (투어 중 매 스텝마다 변경 → 격리 필요)

interface HintsContextType {
  hasSeenWelcome: boolean;
  dismissedHints: Set<string>;
  hintsActive: boolean;
  dismissHint: (hintId: string) => void;
  dismissAllHints: () => void;
  completeWelcomeWithTour: () => void;
  skipWelcome: () => void;
  resetOnboarding: () => void;
  isHintDismissed: (hintId: string) => boolean;
}

interface HelpPanelContextType {
  isHelpPanelOpen: boolean;
  openHelpPanel: () => void;
  closeHelpPanel: () => void;
}

interface TourContextType {
  isTourActive: boolean;
  currentStepIndex: number;
  tourSteps: GuideStep[];
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  registerTabSwitcher: (switcher: TabSwitcher) => void;
  unregisterTabSwitcher: () => void;
  tabSwitcherRef: React.RefObject<TabSwitcher | null>;
}

const HintsContext = createContext<HintsContextType | undefined>(undefined);
const HelpPanelContext = createContext<HelpPanelContextType | undefined>(undefined);
const TourContext = createContext<TourContextType | undefined>(undefined);

const DEFAULT_STATE: OnboardingState = {
  version: ONBOARDING_VERSION,
  hasSeenWelcome: false,
  dismissedHints: [],
  lastSeenAt: new Date().toISOString(),
};

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as OnboardingState;
    if (parsed.version !== ONBOARDING_VERSION) {
      return DEFAULT_STATE;
    }
    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private browsing이나 storage full 등 무시
  }
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  // === Hints state ===
  const [hasSeenWelcome, setHasSeenWelcome] = useState(true); // SSR 기본: 모달 안 보임
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set());
  const [hintsActive, setHintsActive] = useState(false);

  // === HelpPanel state ===
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);

  // === Tour state ===
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const tabSwitcherRef = useRef<TabSwitcher | null>(null);
  const deviceType = useDeviceType();

  // 클라이언트에서 localStorage 로드
  useEffect(() => {
    const state = loadState();
    setHasSeenWelcome(state.hasSeenWelcome);
    setDismissedHints(new Set(state.dismissedHints));
    setHintsActive(false);
  }, []);

  const persistState = useCallback(
    (seen: boolean, hints: Set<string>) => {
      saveState({
        version: ONBOARDING_VERSION,
        hasSeenWelcome: seen,
        dismissedHints: Array.from(hints),
        lastSeenAt: new Date().toISOString(),
      });
    },
    []
  );

  const dismissHint = useCallback(
    (hintId: string) => {
      setDismissedHints((prev) => {
        const next = new Set(prev);
        next.add(hintId);
        persistState(hasSeenWelcome, next);
        return next;
      });
    },
    [hasSeenWelcome, persistState]
  );

  const dismissAllHints = useCallback(() => {
    setHintsActive(false);
  }, []);

  const skipWelcome = useCallback(() => {
    setHasSeenWelcome(true);
    setHintsActive(false);
    persistState(true, dismissedHints);
  }, [dismissedHints, persistState]);

  const openHelpPanel = useCallback(() => {
    setIsHelpPanelOpen(true);
  }, []);

  const closeHelpPanel = useCallback(() => {
    setIsHelpPanelOpen(false);
  }, []);

  const isHintDismissed = useCallback(
    (hintId: string) => dismissedHints.has(hintId),
    [dismissedHints]
  );

  // === Tour ===

  const tourSteps = useMemo(() => {
    const steps = getStepsForPage('note-detail', deviceType);
    return steps.filter((s) => s.id in TOUR_STEP_META);
  }, [deviceType]);

  const switchTabForStep = useCallback(
    (step: GuideStep): Promise<void> => {
      const meta = TOUR_STEP_META[step.id];
      if (!meta || !tabSwitcherRef.current) return Promise.resolve();

      const switcher = tabSwitcherRef.current;

      if (meta.mobileTab && deviceType === 'mobile') {
        switcher.setMobileTab(meta.mobileTab);
      }

      if (meta.desktopRightTab && deviceType !== 'mobile') {
        switcher.setDesktopRightTab(meta.desktopRightTab);
      }

      return new Promise((resolve) => setTimeout(resolve, 350));
    },
    [deviceType]
  );

  const completeWelcomeWithTour = useCallback(async () => {
    setHasSeenWelcome(true);
    persistState(true, dismissedHints);
    if (tourSteps.length > 0) {
      setIsTourActive(true);
      await switchTabForStep(tourSteps[0]);
      setCurrentStepIndex(0);
    }
  }, [dismissedHints, persistState, tourSteps, switchTabForStep]);

  const startTour = useCallback(async () => {
    if (tourSteps.length === 0) return;
    setIsTourActive(true);
    await switchTabForStep(tourSteps[0]);
    setCurrentStepIndex(0);
  }, [tourSteps, switchTabForStep]);

  const nextStep = useCallback(async () => {
    const next = currentStepIndex + 1;
    if (next >= tourSteps.length) {
      setIsTourActive(false);
      setCurrentStepIndex(0);
      return;
    }
    await switchTabForStep(tourSteps[next]);
    setCurrentStepIndex(next);
  }, [currentStepIndex, tourSteps, switchTabForStep]);

  const prevStep = useCallback(async () => {
    const next = Math.max(0, currentStepIndex - 1);
    await switchTabForStep(tourSteps[next]);
    setCurrentStepIndex(next);
  }, [currentStepIndex, tourSteps, switchTabForStep]);

  const skipTour = useCallback(() => {
    setIsTourActive(false);
    setCurrentStepIndex(0);
  }, []);

  const registerTabSwitcher = useCallback((switcher: TabSwitcher) => {
    tabSwitcherRef.current = switcher;
  }, []);

  const unregisterTabSwitcher = useCallback(() => {
    tabSwitcherRef.current = null;
  }, []);

  const resetOnboarding = useCallback(() => {
    setHasSeenWelcome(false);
    setDismissedHints(new Set());
    setHintsActive(false);
    setIsHelpPanelOpen(false);
    setIsTourActive(false);
    setCurrentStepIndex(0);
    saveState(DEFAULT_STATE);
  }, []);

  const hintsValue = useMemo<HintsContextType>(
    () => ({
      hasSeenWelcome,
      dismissedHints,
      hintsActive,
      dismissHint,
      dismissAllHints,
      completeWelcomeWithTour,
      skipWelcome,
      resetOnboarding,
      isHintDismissed,
    }),
    [
      hasSeenWelcome,
      dismissedHints,
      hintsActive,
      dismissHint,
      dismissAllHints,
      completeWelcomeWithTour,
      skipWelcome,
      resetOnboarding,
      isHintDismissed,
    ]
  );

  const helpPanelValue = useMemo<HelpPanelContextType>(
    () => ({ isHelpPanelOpen, openHelpPanel, closeHelpPanel }),
    [isHelpPanelOpen, openHelpPanel, closeHelpPanel]
  );

  const tourValue = useMemo<TourContextType>(
    () => ({
      isTourActive,
      currentStepIndex,
      tourSteps,
      startTour,
      nextStep,
      prevStep,
      skipTour,
      registerTabSwitcher,
      unregisterTabSwitcher,
      tabSwitcherRef,
    }),
    [
      isTourActive,
      currentStepIndex,
      tourSteps,
      startTour,
      nextStep,
      prevStep,
      skipTour,
      registerTabSwitcher,
      unregisterTabSwitcher,
    ]
  );

  return (
    <HintsContext.Provider value={hintsValue}>
      <HelpPanelContext.Provider value={helpPanelValue}>
        <TourContext.Provider value={tourValue}>{children}</TourContext.Provider>
      </HelpPanelContext.Provider>
    </HintsContext.Provider>
  );
}

export function useOnboardingHints(): HintsContextType {
  const ctx = useContext(HintsContext);
  if (!ctx) throw new Error('useOnboardingHints must be used within OnboardingProvider');
  return ctx;
}

export function useHelpPanel(): HelpPanelContextType {
  const ctx = useContext(HelpPanelContext);
  if (!ctx) throw new Error('useHelpPanel must be used within OnboardingProvider');
  return ctx;
}

export function useTour(): TourContextType {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within OnboardingProvider');
  return ctx;
}
