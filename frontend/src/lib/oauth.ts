/**
 * OAuth 관련 유틸리티 함수
 */

/**
 * OAuth 에러 코드를 사용자 친화적 메시지로 변환
 */
export function getOAuthErrorMessage(error: string): string {
  const errorMessages: Record<string, string> = {
    access_denied: '접근이 거부되었습니다.',
    invalid_request: '잘못된 요청입니다.',
    unauthorized_client: '권한이 없는 클라이언트입니다.',
    unsupported_response_type: '지원되지 않는 응답 유형입니다.',
    invalid_scope: '잘못된 범위입니다.',
    server_error: '서버 오류가 발생했습니다.',
    temporarily_unavailable: '서비스가 일시적으로 사용할 수 없습니다.',
  };
  return errorMessages[error] || `인증 오류: ${error}`;
}

/**
 * 프로바이더 코드를 표시용 이름으로 변환
 */
export function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    google: 'Google',
    github: 'GitHub',
    naver: 'Naver',
    kakao: 'Kakao',
  };
  return names[provider] || provider;
}

/**
 * OAuth state 검증
 * @returns null if valid, error message if invalid
 */
export function validateOAuthState(provider: string, state: string | null): string | null {
  const savedState = sessionStorage.getItem(`oauth_state_${provider}`);

  if (!state || !savedState) {
    return '보안 검증 정보가 없습니다. 다시 시도해주세요.';
  }

  if (savedState !== state) {
    return '보안 검증에 실패했습니다. 다시 시도해주세요.';
  }

  // 검증 성공 시 state 삭제
  sessionStorage.removeItem(`oauth_state_${provider}`);
  return null;
}
