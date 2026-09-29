'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/config';
import { getOAuthErrorMessage, validateOAuthState } from '@/lib/oauth';
import { OAuthLoadingState, OAuthErrorState } from '@/components/auth/OAuthCallbackLayout';
import { useAuth } from '@/hooks/useAuth';

/**
 * 에러 메시지에서 민감한 정보를 제거하고 사용자 친화적 메시지 반환
 * 보안: 기술적 세부사항이 사용자에게 노출되지 않도록 필터링
 */
function getSafeErrorMessage(error: any): string {
  // 알려진 에러 코드 매핑
  const errorMap: Record<string, string> = {
    'invalid_grant': '인증이 만료되었습니다. 다시 로그인해주세요.',
    'access_denied': '접근이 거부되었습니다.',
    'temporarily_unavailable': '서비스가 일시적으로 사용 불가합니다.',
    'server_error': '서버 오류가 발생했습니다.',
    'invalid_token': '유효하지 않은 토큰입니다.',
    'token_expired': '토큰이 만료되었습니다.',
    'invalid_request': '잘못된 요청입니다.',
    'unauthorized_client': '인증되지 않은 클라이언트입니다.',
  };

  // 알려진 에러 코드 확인
  const errorCode = error?.code || error?.error;
  if (errorCode && errorMap[errorCode]) {
    return errorMap[errorCode];
  }

  // 서버 에러 메시지 검사
  const serverMessage = error?.detail || error?.non_field_errors?.[0] || error?.message;
  if (serverMessage) {
    // 민감한 정보 패턴 검사
    const sensitivePatterns = [
      /exception/i, /stack/i, /trace/i,
      /database/i, /sql/i, /query/i,
      /internal/i, /server/i, /path/i,
      /file/i, /module/i, /function/i,
    ];

    const isSensitive = sensitivePatterns.some(pattern => pattern.test(serverMessage));

    // 민감하지 않고 적절한 길이의 메시지만 표시
    if (!isSensitive && serverMessage.length < 200) {
      return serverMessage;
    }
  }

  // 기본 안전 메시지
  return '로그인에 실패했습니다. 다시 시도해주세요.';
}

/**
 * OAuth 콜백 페이지
 *
 * OAuth 프로바이더로부터 authorization code를 받아
 * 백엔드 dj-rest-auth API에 전달하여 JWT 토큰을 교환합니다.
 * JWT 토큰은 HttpOnly 쿠키로 자동 설정됩니다.
 */
export default function SocialAuthCallbackPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { loadMe } = useAuth();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // React StrictMode에서 useEffect 중복 실행 방지
  const isProcessingRef = useRef(false);

  const provider = params.provider as string;

  useEffect(() => {
    const handleCallback = async () => {
      // 이미 처리 중이면 무시 (StrictMode 중복 실행 방지)
      if (isProcessingRef.current) {
        return;
      }
      isProcessingRef.current = true;

      // 보안: URL에서 민감한 OAuth 파라미터를 즉시 제거 (브라우저 히스토리 노출 방지)
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const state = searchParams.get('state');

      // URL 파라미터 정리 (code, state 등 민감 정보 제거)
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }

      // OAuth 에러 처리
      if (error) {
        setStatus('error');
        setErrorMessage(getOAuthErrorMessage(error));
        return;
      }

      // authorization code 확인
      if (!code) {
        setStatus('error');
        setErrorMessage('인증 코드가 없습니다. 다시 시도해주세요.');
        return;
      }

      // CSRF 방지: state 검증
      const stateError = validateOAuthState(provider, state);
      if (stateError) {
        setStatus('error');
        setErrorMessage(stateError);
        return;
      }

      try {
        // 백엔드 dj-rest-auth API로 code 전송하여 JWT 토큰 교환
        // credentials: 'include'로 HttpOnly 쿠키가 자동 설정됨
        const response = await fetch(`${API_BASE_URL}/api/auth/social/${provider}/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            code,
            ...(state ? { state } : {}),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // 보안: 민감한 정보 필터링된 에러 메시지 사용
          throw new Error(getSafeErrorMessage(errorData));
        }

        const data = await response.json();

        // 이메일 입력이 필요한 경우
        if (data.email_required) {
          // 임시 토큰은 서버가 HttpOnly 쿠키로 심어 자동 전송된다(JS 저장 안 함).
          // 프로바이더 정보만 화면 표시·흐름 판정용으로 세션에 저장.
          sessionStorage.setItem('social_provider', data.provider || provider);
          // 이메일 입력 페이지로 리다이렉트
          router.push('/auth/social-email-required');
          return;
        }

        // JWT 토큰은 HttpOnly 쿠키로 자동 설정됨 (localStorage 저장 불필요)
        // 로그인 직후 AuthContext의 user 상태를 갱신해야 /dashboard의 AuthGuard가
        // 통과함. 누락 시 '/' ↔ '/dashboard' 무한 리다이렉트 루프 발생.
        await loadMe();
        // 대시보드로 리다이렉트
        router.push('/dashboard');
      } catch (err) {
        setStatus('error');
        // 보안: 예외 객체도 민감한 정보 필터링 적용
        setErrorMessage(err instanceof Error ? err.message : getSafeErrorMessage(err));
      }
    };

    handleCallback();
  }, [provider, searchParams, router, loadMe]);

  if (status === 'error') {
    return (
      <OAuthErrorState
        message={errorMessage}
        returnPath="/"
        buttonText="로그인 페이지로 돌아가기"
        onReturn={() => router.push('/')}
      />
    );
  }

  return <OAuthLoadingState provider={provider} action="login" />;
}
