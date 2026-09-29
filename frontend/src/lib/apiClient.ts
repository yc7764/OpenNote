import { API_BASE_URL } from './config';

/**
 * API 에러 클래스
 * 서버 응답 에러를 타입 안전하게 처리합니다.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly detail: string;
  public readonly fieldErrors: Record<string, string[]>;

  constructor(
    status: number,
    detail: string = '',
    fieldErrors: Record<string, string[]> = {},
    message?: string
  ) {
    super(message || detail || '요청 처리 중 오류가 발생했습니다');
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
  }

  /** 404 Not Found */
  isNotFound(): boolean {
    return this.status === 404;
  }

  /** 401 Unauthorized */
  isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** 403 Forbidden */
  isForbidden(): boolean {
    return this.status === 403;
  }

  /** 5xx Server Error */
  isServerError(): boolean {
    return this.status >= 500;
  }

  /** 400 Bad Request */
  isBadRequest(): boolean {
    return this.status === 400;
  }

  /** 409 Conflict */
  isConflict(): boolean {
    return this.status === 409;
  }
}

// 토큰 갱신 단일 비행(single-flight) 게이트.
// 이전엔 isRefreshing(boolean)과 refreshPromise를 각각 다른 시점에 set/reset해
// 동시 401 사이에 중복 refresh가 생길 창이 있었다. refreshPromise 참조 하나로만 게이트하고
// 리셋을 promise의 .finally에 묶어 창을 없앤다.
let refreshPromise: Promise<boolean> | null = null;

/**
 * JWT 토큰 갱신
 * HttpOnly 쿠키의 refresh_token을 사용하여 새 access_token을 발급받습니다.
 */
async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/token/refresh/`, {
      method: 'POST',
      credentials: 'include',  // refresh_token 쿠키 자동 전송
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * API 클라이언트
 *
 * JWT 토큰은 HttpOnly 쿠키로 자동 전송됩니다.
 * - credentials: 'include'로 쿠키가 자동으로 포함됨
 * - Authorization 헤더 불필요 (쿠키 인증 사용)
 * - 401 응답시 자동으로 토큰 갱신 시도
 */
export async function apiClient<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;

  // JSON 기본 헤더는 FormData가 아닌 경우에만 설정
  const headers: HeadersInit =
    !isFormData && !('Content-Type' in (init.headers || {}))
      ? { 'Content-Type': 'application/json', ...(init.headers || {}) }
      : { ...(init.headers || {}) };

  const makeRequest = async () => {
    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',  // HttpOnly 쿠키(JWT) 자동 전송
    });
  };

  let response = await makeRequest();

  // 401 응답이고, 토큰 갱신 엔드포인트가 아닌 경우 갱신 시도
  if (response.status === 401 && !path.includes('/token/refresh') && !path.includes('/login')) {
    // 진행 중인 refresh가 있으면 그 결과를 재사용(단일 비행), 없으면 시작한다.
    // 참조 확인→대입 사이에 await가 없어 원자적이며, .finally로 리셋을 묶어
    // 동시 401이 항상 같은 refreshPromise를 공유하게 한다.
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;

    if (refreshed) {
      // 갱신 성공 → 원래 요청 재시도
      response = await makeRequest();
    } else {
      // 갱신 실패 → 로그인 페이지로 리다이렉트
      // 단, 로그인/인증 관련 페이지에서는 리다이렉트하지 않음
      // L11: window는 브라우저에만 존재하므로 접근 전에 먼저 가드한다. 과거엔
      // isAuthPage 계산에서 window.location.pathname을 먼저 읽어, 이 분기가 서버
      // (SSR·route handler)에서 실행되면 ReferenceError로 크래시할 수 있었다.
      if (typeof window !== 'undefined') {
        const authPages = ['/', '/signup', '/password-reset', '/email-verification', '/email-change', '/auth/', '/terms', '/privacy', '/about'];
        const isAuthPage = authPages.some(p =>
          window.location.pathname === p || window.location.pathname.startsWith('/auth/')
        );
        if (!isAuthPage) {
          // 보안: URL 파라미터 대신 sessionStorage 사용 (정보 노출 방지)
          sessionStorage.setItem('auth_session_expired', 'true');
          window.location.href = '/';
        }
      }
    }
  }

  if (!response.ok) {
    let payload: Record<string, unknown> | undefined;
    try {
      payload = await response.json();
    } catch {
      // JSON 파싱 실패 시 undefined 유지
    }

    // payload에서 안전하게 값 추출
    const detail = typeof payload?.detail === 'string' ? payload.detail : '';

    // 필드별 에러 추출 (Django REST Framework 형식)
    const fieldErrors: Record<string, string[]> = {};
    if (payload) {
      for (const [key, value] of Object.entries(payload)) {
        if (key !== 'detail' && key !== 'status') {
          if (Array.isArray(value)) {
            fieldErrors[key] = value.map(v => String(v));
          } else if (typeof value === 'string') {
            fieldErrors[key] = [value];
          }
        }
      }
    }

    throw new ApiError(response.status, detail, fieldErrors);
  }

  try {
    return (await response.json()) as T;
  } catch {
    // no content
    return undefined as unknown as T;
  }
}

/**
 * 인증 상태 확인
 * HttpOnly 쿠키 기반이므로 서버에 요청하여 확인합니다.
 */
export async function checkAuthStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
}
