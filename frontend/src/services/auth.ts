import { apiClient } from '@/lib/apiClient';
import {
  getGoogleClientId,
  getGithubClientId,
  getGithubConnectClientId,
  getNaverClientId,
  getKakaoClientId,
  getApiUrl,
} from '@/lib/env';
import type {
  User,
  LoginResponse,
  LinkedAccountsResponse,
  SocialProvider,
  SetPasswordRequest,
  MergeAccountsRequest,
  MergeAccountsResponse,
} from '@/types/auth';
import type { UserQuota } from '@/types/quota';

export async function fetchMe(): Promise<User> { return apiClient('/api/auth/profile/'); }

export async function fetchQuota(): Promise<UserQuota> {
  return apiClient('/api/accounts/quota/');
}

export async function login(loginIdentifier: string, password: string): Promise<LoginResponse> {
  return apiClient('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ login: loginIdentifier, password }),
  });
}

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/token/refresh/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// === dj-rest-auth 기반 소셜 로그인 API ===

/**
 * 소셜 OAuth URL 생성
 *
 * 각 프로바이더별 OAuth 인증 페이지로 리다이렉트하기 위한 URL을 생성합니다.
 *
 * @param provider - 소셜 프로바이더 (google, github, naver, kakao)
 * @param mode - 'login' (로그인/회원가입) 또는 'connect' (계정 연결)
 */
export function getSocialLoginUrl(
  provider: SocialProvider,
  mode: 'login' | 'connect' = 'login',
  externalState?: string,
): string {
  const frontendUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const callbackPath = mode === 'connect' ? '/auth/connect/callback' : '/auth/callback';
  const callbackUrl = `${frontendUrl}${callbackPath}/${provider}`;

  // 연동(connect)은 서버가 발급한 state(externalState)를 쓰면 백엔드가 쿠키와
  // 대조해 CSRF를 차단할 수 있다. 로그인(login)은 종전대로 클라이언트 생성 state.
  const stateFor = (key: string) => {
    const state = externalState || crypto.randomUUID();
    sessionStorage.setItem(key, state);
    return state;
  };

  // 각 프로바이더별 OAuth 인증 URL
  const providerUrls: Record<SocialProvider, () => string> = {
    google: () => {
      const clientId = getGoogleClientId();
      const scope = 'email profile';
      const state = stateFor('oauth_state_google');
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${state}`;
    },
    github: () => {
      // 계정 연동 시에는 별도의 GitHub OAuth App 사용 (콜백 URL이 다르므로)
      const clientId = mode === 'connect'
        ? getGithubConnectClientId()
        : getGithubClientId();
      const scope = 'user:email';
      const state = stateFor('oauth_state_github');
      return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scope)}&state=${state}`;
    },
    naver: () => {
      const clientId = getNaverClientId();
      const state = stateFor('oauth_state_naver');
      return `https://nid.naver.com/oauth2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&state=${state}`;
    },
    kakao: () => {
      const clientId = getKakaoClientId();
      const state = stateFor('oauth_state_kakao');
      return `https://kauth.kakao.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&state=${state}`;
    },
  };

  return providerUrls[provider]();
}

/**
 * 소셜 연동 시작 전 서버에서 CSRF state를 발급받는다.
 * 서버가 state를 HttpOnly 쿠키(connect_state)로 심고 값도 반환하며,
 * 이 값을 OAuth URL과 연동 POST에 함께 실어 서버가 대조한다.
 */
export async function prepareSocialConnect(provider: SocialProvider): Promise<string> {
  const res = await apiClient<{ state: string }>(`/api/auth/social/${provider}/connect/prepare/`);
  return res.state;
}

// === Master Account 시스템: 소셜 계정 관리 API ===

/**
 * 연결된 소셜 계정 목록 조회
 */
export async function fetchLinkedAccounts(): Promise<LinkedAccountsResponse> {
  return apiClient('/api/auth/profile/linked-accounts/');
}

/**
 * 소셜 계정 연결 응답 타입
 */
export interface ConnectSocialAccountResponse {
  message: string;
  merge_required?: boolean;
  // merge_token은 HttpOnly 쿠키로 전달되므로 응답 바디에 포함되지 않는다
  other_email?: string;  // 다른 사용자에게 연결된 경우, 해당 사용자의 이메일
  provider?: string;
}

/**
 * 소셜 계정 연결 (이미 로그인된 사용자)
 *
 * POST /api/auth/social/{provider}/connect/
 *
 * 응답 시나리오:
 * 1. 성공적으로 연결됨: { message: "..." }
 * 2. 이미 다른 사용자에게 연결됨 (병합 필요): { message: "...", merge_required: true, merge_token: "...", existing_user_email: "..." }
 */
export async function connectSocialAccount(
  provider: SocialProvider,
  code: string,
  state: string
): Promise<ConnectSocialAccountResponse> {
  return apiClient(`/api/auth/social/${provider}/connect/`, {
    method: 'POST',
    body: JSON.stringify({ code, state }),
  });
}

/**
 * 소셜 계정 연결 해제
 *
 * POST /api/auth/social/{provider}/disconnect/
 */
export async function disconnectSocialAccount(
  provider: SocialProvider
): Promise<{ message: string }> {
  return apiClient(`/api/auth/social/${provider}/disconnect/`, {
    method: 'POST',
  });
}

/**
 * 비밀번호 설정 (소셜 전용 사용자)
 */
export async function setPassword(
  data: SetPasswordRequest
): Promise<{ message: string }> {
  return apiClient('/api/auth/password/set/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 계정 병합
 */
export async function mergeAccounts(
  data: MergeAccountsRequest
): Promise<MergeAccountsResponse> {
  return apiClient('/api/auth/accounts/merge/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
