/**
 * Runtime Environment Variable Utility
 * =============================================================================
 * 이 모듈은 NEXT_PUBLIC_* 환경변수를 런타임에 접근할 수 있게 합니다.
 *
 * Docker 환경에서는 컨테이너 시작 시 scripts/env.sh가 실행되어
 * public/__ENV.js 파일이 생성됩니다. 이 파일은 window.__ENV 객체를 정의합니다.
 *
 * 개발 환경(npm run dev)에서는 기존처럼 process.env를 사용합니다.
 *
 * 사용 방법:
 *   import { getEnv } from '@/lib/env';
 *   const apiUrl = getEnv('NEXT_PUBLIC_API_URL');
 * =============================================================================
 */

// TypeScript를 위한 window.__ENV 타입 정의
declare global {
  interface Window {
    __ENV?: Record<string, string>;
  }
}

/**
 * 환경변수 값을 가져옵니다.
 *
 * 우선순위:
 * 1. 브라우저 환경: window.__ENV (런타임 주입된 값)
 * 2. 서버 환경 또는 fallback: process.env
 *
 * @param key - 환경변수 키 (예: 'NEXT_PUBLIC_API_URL')
 * @param defaultValue - 기본값 (선택사항)
 * @returns 환경변수 값 또는 기본값
 */
export function getEnv(key: string, defaultValue: string = ''): string {
  // 브라우저 환경에서 런타임 주입된 환경변수 확인
  if (typeof window !== 'undefined' && window.__ENV) {
    const runtimeValue = window.__ENV[key];
    if (runtimeValue !== undefined && runtimeValue !== '__RUNTIME_PLACEHOLDER__') {
      return runtimeValue;
    }
  }

  // 서버 사이드 또는 개발 환경에서는 process.env 사용
  if (typeof process !== 'undefined' && process.env) {
    const processValue = process.env[key];
    if (processValue !== undefined && processValue !== '__RUNTIME_PLACEHOLDER__') {
      return processValue;
    }
  }

  return defaultValue;
}

// 자주 사용되는 환경변수들을 미리 정의 (타입 안전성 향상)
export const ENV_KEYS = {
  API_URL: 'NEXT_PUBLIC_API_URL',
  GOOGLE_CLIENT_ID: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  GITHUB_CLIENT_ID: 'NEXT_PUBLIC_GITHUB_CLIENT_ID',
  GITHUB_CONNECT_CLIENT_ID: 'NEXT_PUBLIC_GITHUB_CONNECT_CLIENT_ID',
  NAVER_CLIENT_ID: 'NEXT_PUBLIC_NAVER_CLIENT_ID',
  KAKAO_CLIENT_ID: 'NEXT_PUBLIC_KAKAO_CLIENT_ID',
  STT_EDIT_MODULE_URL: 'NEXT_PUBLIC_STT_EDIT_MODULE_URL',
} as const;

// 편의 함수들
export const getApiUrl = () => {
  const url = getEnv(ENV_KEYS.API_URL, '');
  if (!url) {
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:8000';
    }
    // 운영 도메인 하드코딩 제거 — 운영은 NEXT_PUBLIC_API_URL을 반드시 설정한다
    // (getWsUrl/getSttEditModuleUrl과 동일 규칙). 저장소에 운영 도메인을 남기지 않는다.
    return '';
  }
  return url;
};

export const getSttEditModuleUrl = () => {
  const url = getEnv(ENV_KEYS.STT_EDIT_MODULE_URL, '');
  const resolved = url || (process.env.NODE_ENV === 'development' ? 'http://localhost:21123' : '');
  // https 페이지에서는 소켓도 wss로 연결되도록 스킴을 승격한다.
  // socket.io는 준 URL의 스킴으로 보안 여부를 정하므로, http:// → https://로 바꾸면 wss가 된다.
  // (빈 문자열이면 상대 경로가 되어 socket.io가 window.location 기준으로 wss를 자동 선택)
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    resolved.startsWith('http://')
  ) {
    return 'https://' + resolved.slice('http://'.length);
  }
  return resolved;
};

// OAuth Client IDs
export const getGoogleClientId = () => getEnv(ENV_KEYS.GOOGLE_CLIENT_ID, '');
export const getGithubClientId = () => getEnv(ENV_KEYS.GITHUB_CLIENT_ID, '');
export const getGithubConnectClientId = () => getEnv(ENV_KEYS.GITHUB_CONNECT_CLIENT_ID, '');
export const getNaverClientId = () => getEnv(ENV_KEYS.NAVER_CLIENT_ID, '');
export const getKakaoClientId = () => getEnv(ENV_KEYS.KAKAO_CLIENT_ID, '');
