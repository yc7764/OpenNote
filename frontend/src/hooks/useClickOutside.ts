import { useEffect, RefObject } from 'react';

/**
 * 특정 요소 외부 클릭을 감지하는 커스텀 훅
 *
 * @param ref 감지할 요소의 ref
 * @param handler 외부 클릭 시 실행할 콜백
 * @param enabled 활성화 여부 (기본: true)
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T>,
  handler: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    };

    // mousedown 사용 - click보다 먼저 발생하여 더 자연스러운 UX
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, handler, enabled]);
}
