'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { connectSocialAccount } from '@/services/auth';
import { getOAuthErrorMessage, validateOAuthState } from '@/lib/oauth';
import { OAuthLoadingState, OAuthErrorState } from '@/components/auth/OAuthCallbackLayout';

/**
 * 소셜 계정 연결 콜백 페이지
 *
 * OAuth 프로바이더로부터 authorization code를 받아
 * 백엔드 API에 전달하여 기존 사용자에게 소셜 계정을 연결합니다.
 */
export default function SocialConnectCallbackPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
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

      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const state = searchParams.get('state');

      // code/state/merge_token 등 민감 파라미터가 브라우저 히스토리·서버
      // 액세스 로그에 잔존하지 않도록 즉시 URL을 스크럽한다(로그인 콜백과 동일 패턴).
      if (typeof window !== 'undefined' && (code || state || error)) {
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
        // 백엔드 API로 code 전송하여 소셜 계정 연결
        // state를 함께 보내 백엔드가 connect_state 쿠키와 대조하게 한다
        const response = await connectSocialAccount(provider as any, code, state ?? '');

        // 병합이 필요한 경우 (이미 다른 사용자에게 연결된 소셜 계정)
        if (response.merge_required) {
          // 병합 토큰은 HttpOnly 쿠키로 전달됨 — URL 쿼리에 싣지 않는다
          const params = new URLSearchParams({
            linked: provider,
            merge_required: 'true',
          });
          if (response.other_email) {
            params.set('other_email', response.other_email);
          }
          router.push('/profile?' + params.toString());
        } else {
          // 성공적으로 연결됨 - 프로필 페이지로 리다이렉트
          router.push('/profile?linked=' + provider + '&success=true');
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : '소셜 계정 연결 중 오류가 발생했습니다.');
      }
    };

    handleCallback();
  }, [provider, searchParams, router]);

  if (status === 'error') {
    return (
      <OAuthErrorState
        message={errorMessage}
        returnPath="/profile"
        buttonText="프로필로 돌아가기"
        onReturn={() => router.push('/profile')}
      />
    );
  }

  return <OAuthLoadingState provider={provider} action="connect" />;
}
