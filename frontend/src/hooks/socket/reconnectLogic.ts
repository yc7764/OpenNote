import { toast } from 'sonner';
import { Socket } from 'socket.io-client';
import { refreshAccessToken } from '@/services/auth';
import type { ReconnectState } from './socketEventHandlers';
// storage, TOKEN_KEYS import 제거 - HttpOnly 쿠키로 토큰 자동 관리

// Exponential Backoff 설정
export const BACKOFF_CONFIG = {
  BASE_DELAY_MS: 1000,    // 기본 대기 시간 (1초)
  MAX_DELAY_MS: 30000,    // 최대 대기 시간 (30초)
  MAX_ATTEMPTS: 5,        // 최대 재연결 시도 횟수
  MULTIPLIER: 2,          // 지수 배수
};

export interface ReconnectDependencies {
  socketRef: React.MutableRefObject<Socket | null>;
  reconnectStateRef: React.MutableRefObject<ReconnectState>;
  connectSocketRef: React.MutableRefObject<(() => void | Promise<void>) | null>;
}

/**
 * 실제 재연결 실행 함수 생성
 * - 현재 소켓 해제
 * - 토큰 갱신 (필요 시)
 * - 새 소켓 연결
 */
export function createExecuteReconnect(deps: ReconnectDependencies) {
  const { socketRef, reconnectStateRef, connectSocketRef } = deps;

  return async (refreshTokenFirst: boolean) => {
    reconnectStateRef.current.inProgress = true;
    reconnectStateRef.current.reconnectAttempts += 1;

    // 1. 현재 소켓 해제
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // 2. 토큰 갱신 (E4xx인 경우)
    if (refreshTokenFirst) {
      if (reconnectStateRef.current.tokenRefreshed) {
        // 이미 토큰 갱신 시도했는데 또 실패 → 최종 실패
        toast.error('세션이 만료되었습니다. 다시 로그인을 해주세요.');
        reconnectStateRef.current.inProgress = false;
        reconnectStateRef.current.reconnectAttempts = 0;
        return;
      }

      // HttpOnly 쿠키 기반 토큰 갱신
      // 서버에서 새 토큰을 HttpOnly 쿠키로 자동 설정
      const result = await refreshAccessToken();
      if (!result) {
        toast.error('세션이 만료되었습니다. 다시 로그인을 해주세요.');
        reconnectStateRef.current.inProgress = false;
        reconnectStateRef.current.reconnectAttempts = 0;
        return;
      }
      // 토큰은 HttpOnly 쿠키로 자동 설정되므로 별도 저장 불필요
      reconnectStateRef.current.tokenRefreshed = true;

      // 30초 후 자동 리셋 타임아웃 설정 (noteData가 도착하지 않는 경우 대비)
      if (reconnectStateRef.current.tokenRefreshTimeoutId) {
        clearTimeout(reconnectStateRef.current.tokenRefreshTimeoutId);
      }
      reconnectStateRef.current.tokenRefreshTimeoutId = setTimeout(() => {
        reconnectStateRef.current.tokenRefreshed = false;
        reconnectStateRef.current.tokenRefreshTimeoutId = null;
      }, 30000);
    }

    // 3. 새 소켓 연결 (connectSocketRef를 통해 호출)
    connectSocketRef.current?.();
    reconnectStateRef.current.inProgress = false;
  };
}

/**
 * 재연결 시도 함수 생성 (Exponential Backoff 적용)
 * - 최대 시도 횟수 체크
 * - Backoff 딜레이 계산 (지수 백오프 + jitter)
 */
export function createAttemptReconnect(
  deps: ReconnectDependencies,
  executeReconnect: (refreshTokenFirst: boolean) => Promise<void>
) {
  const { reconnectStateRef } = deps;

  return async (refreshTokenFirst: boolean) => {
    if (reconnectStateRef.current.inProgress) return;

    const { reconnectAttempts, reconnectTimeoutId } = reconnectStateRef.current;

    // 기존 대기 타이머가 있으면 클리어
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectStateRef.current.reconnectTimeoutId = null;
    }

    // 최대 시도 횟수 초과 체크
    if (reconnectAttempts >= BACKOFF_CONFIG.MAX_ATTEMPTS) {
      toast.error('연결에 실패했습니다. 페이지를 새로고침 해주세요.');
      reconnectStateRef.current.reconnectAttempts = 0;
      return;
    }

    // 첫 번째 시도는 즉시, 이후는 딜레이 적용
    if (reconnectAttempts > 0) {
      // Backoff 딜레이 계산 (지수 백오프 + jitter)
      const delay = Math.min(
        BACKOFF_CONFIG.BASE_DELAY_MS * Math.pow(BACKOFF_CONFIG.MULTIPLIER, reconnectAttempts),
        BACKOFF_CONFIG.MAX_DELAY_MS
      );
      const jitter = Math.random() * 0.3 * delay; // ±15% jitter
      const actualDelay = delay + jitter;

      // Reconnection scheduled - debug info removed for production

      reconnectStateRef.current.reconnectTimeoutId = setTimeout(() => {
        executeReconnect(refreshTokenFirst);
      }, actualDelay);
    } else {
      executeReconnect(refreshTokenFirst);
    }
  };
}

/**
 * 재연결 관련 타이머 정리 함수
 */
export function cleanupReconnectTimers(reconnectStateRef: React.MutableRefObject<ReconnectState>) {
  // 토큰 갱신 타임아웃 클리어
  if (reconnectStateRef.current.tokenRefreshTimeoutId) {
    clearTimeout(reconnectStateRef.current.tokenRefreshTimeoutId);
    reconnectStateRef.current.tokenRefreshTimeoutId = null;
  }
  // Backoff 재연결 타이머 클리어
  if (reconnectStateRef.current.reconnectTimeoutId) {
    clearTimeout(reconnectStateRef.current.reconnectTimeoutId);
    reconnectStateRef.current.reconnectTimeoutId = null;
  }
}
