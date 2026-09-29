import type { MutableRefObject } from 'react';
import { AUTO_SAVE_TIMEOUT_MS, MAX_EDIT_DURATION_MS } from '@/constants/timeouts';

type Timer = ReturnType<typeof setTimeout>;

/**
 * 편집 도중 타이핑할 때마다 호출. 다음 둘 중 하나를 수행:
 * 1) 편집 시작 후 MAX_EDIT_DURATION_MS 이상 경과 → 즉시 finish
 * 2) 그 외 → AUTO_SAVE_TIMEOUT_MS 후 finish (남은 max 시간보다 작은 값 사용)
 *
 * Segment/Keywords/Section 편집 textChange 핸들러에서 공통으로 사용.
 */
export function scheduleAutoSave(
  startTimeRef: MutableRefObject<number | null>,
  autoRevertTimerRef: MutableRefObject<Timer | null>,
  finishHandler: () => void
): void {
  const elapsed = startTimeRef.current ? Date.now() - startTimeRef.current : 0;

  if (elapsed >= MAX_EDIT_DURATION_MS) {
    finishHandler();
    return;
  }

  const remainingTime = MAX_EDIT_DURATION_MS - elapsed;
  const timeout = Math.min(AUTO_SAVE_TIMEOUT_MS, remainingTime);

  autoRevertTimerRef.current = setTimeout(finishHandler, timeout);
}

/**
 * 편집 시작 시 호출. 편집 시작 시간을 기록하고 AUTO_SAVE_TIMEOUT_MS 타이머 설정.
 */
export function startEditTimer(
  startTimeRef: MutableRefObject<number | null>,
  autoRevertTimerRef: MutableRefObject<Timer | null>,
  finishHandler: () => void
): void {
  startTimeRef.current = Date.now();
  autoRevertTimerRef.current = setTimeout(finishHandler, AUTO_SAVE_TIMEOUT_MS);
}
