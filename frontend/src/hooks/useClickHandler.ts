import { useRef, useCallback } from 'react';

const DOUBLE_CLICK_DELAY = 200; // ms

/**
 * 클릭과 더블클릭 이벤트를 분리하는 커스텀 훅
 *
 * 브라우저 기본 동작에서는 더블클릭 시 클릭 이벤트가 먼저 2번 발생하는데,
 * 이 훅을 사용하면 더블클릭 시 클릭 이벤트 없이 더블클릭만 처리됩니다.
 *
 * @param onSingleClick 단일 클릭 시 실행할 콜백
 * @param onDoubleClick 더블클릭 시 실행할 콜백
 * @returns 클릭 이벤트 핸들러
 */
export function useClickHandler(
  onSingleClick?: () => void,
  onDoubleClick?: () => void
) {
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCountRef = useRef(0);

  const handleClick = useCallback(() => {
    clickCountRef.current += 1;

    if (clickCountRef.current === 1) {
      // 첫 번째 클릭: 타이머 시작
      clickTimeoutRef.current = setTimeout(() => {
        if (clickCountRef.current === 1) {
          onSingleClick?.();
        }
        clickCountRef.current = 0;
      }, DOUBLE_CLICK_DELAY);
    } else if (clickCountRef.current === 2) {
      // 두 번째 클릭: 타이머 취소 후 더블클릭 처리
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      onDoubleClick?.();
      clickCountRef.current = 0;
    }
  }, [onSingleClick, onDoubleClick]);

  return handleClick;
}
