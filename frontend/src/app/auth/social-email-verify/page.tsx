'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/lib/config';
import { getErrorMessage } from '@/lib/errors';
import ThemeToggle from '@/components/common/ThemeToggle';

/**
 * 소셜 로그인 이메일 인증 페이지
 *
 * 이메일 인증 대기 상태 표시 및 인증 완료 처리
 * - 이메일 링크 클릭 시: token 파라미터로 인증 완료
 * - 인증 대기 시: HttpOnly 쿠키(social_temp_token)로 상태 확인 및 재전송
 */
function SocialEmailVerifyContent() {
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [provider, setProvider] = useState<string>('');
  const hasInitialized = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const getProviderDisplayName = (provider: string): string => {
    const names: Record<string, string> = {
      google: 'Google',
      github: 'GitHub',
      naver: 'Naver',
      kakao: 'Kakao',
    };
    return names[provider] || provider;
  };

  useEffect(() => {
    // 이미 초기화된 경우 중복 실행 방지
    if (hasInitialized.current) return;

    const tokenParam = searchParams.get('token');

    if (tokenParam) {
      // R3: 인증 토큰을 변수에 담은 직후 주소에서 지운다(히스토리·로그·Referer 잔존
      // 방지). verifyEmail은 담아둔 값으로 진행하므로 스크럽해도 인증에 영향 없음.
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
      // 이메일 링크에서 접근 - 인증 완료 처리
      verifyEmail(tokenParam);
    } else {
      // 이메일 입력 후 대기 상태. 임시 토큰은 HttpOnly 쿠키라 JS로 못 읽으므로
      // 흐름 진입은 비민감 마커(social_pending_email)로 판정한다.
      const email = sessionStorage.getItem('social_pending_email');
      const prov = sessionStorage.getItem('social_provider');

      if (!email) {
        // 필요한 정보가 없으면 로그인 페이지로
        router.push('/');
        return;
      }

      setUserEmail(email);
      setProvider(prov || '');
      setVerificationStatus('pending');
    }

    hasInitialized.current = true;
  }, [searchParams, router]);

  useEffect(() => {
    // 재전송 쿨다운 타이머
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const verifyEmail = async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/social/verify-email/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok && data.verified) {
        // 인증 성공
        setVerificationStatus('success');
        setUserEmail(data.user?.email || '');
        toast.success('이메일 인증이 완료되었습니다!');

        // JWT 토큰은 HttpOnly 쿠키로 자동 설정됨

        // 세션 정리
        sessionStorage.removeItem('social_provider');
        sessionStorage.removeItem('social_pending_email');
      } else {
        setVerificationStatus('error');
        setErrorType(data.error || 'unknown');
        toast.error(data.error || '인증에 실패했습니다.');
      }
    } catch {
      setVerificationStatus('error');
      setErrorType('network_error');
      toast.error('인증 처리 중 오류가 발생했습니다.');
    }
  };

  const handleResendEmail = async () => {
    setIsResending(true);
    setApiError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/social/resend-email/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 임시 토큰은 HttpOnly 쿠키로 자동 전송된다.
        credentials: 'include',
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '이메일 재전송에 실패했습니다.');
      }

      toast.success('인증 이메일이 재전송되었습니다. 이메일을 확인해주세요.');
      setResendCooldown(60); // 60초 쿨다운

    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, '이메일 재전송에 실패했습니다.');
      setApiError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsResending(false);
    }
  };

  const checkVerificationStatus = async () => {
    setIsCheckingStatus(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/social/verify-status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 임시 토큰은 HttpOnly 쿠키로 자동 전송된다.
        credentials: 'include',
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (response.ok && data.status === 'completed') {
        // 인증 완료됨
        setVerificationStatus('success');
        toast.success('이메일 인증이 완료되었습니다!');

        // JWT 토큰은 HttpOnly 쿠키로 자동 설정됨

        // 세션 정리
        sessionStorage.removeItem('social_provider');
        sessionStorage.removeItem('social_pending_email');
      } else if (data.status === 'expired') {
        setVerificationStatus('error');
        setErrorType('expired');
        toast.error('인증 토큰이 만료되었습니다. 다시 로그인해주세요.');
      } else {
        toast.info('아직 이메일 인증이 완료되지 않았습니다.');
      }
    } catch (error) {
      toast.error('인증 상태 확인에 실패했습니다.');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleGoToLogin = () => {
    // 세션 정리
    sessionStorage.removeItem('social_provider');
    sessionStorage.removeItem('social_pending_email');
    router.push('/');
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 py-12 relative">
      {/* Theme Toggle */}
      <div className="fixed top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors">
        {/* Header with Status Icon */}
        <div className="text-center mb-8">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            verificationStatus === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
            verificationStatus === 'error' ? 'bg-red-100 dark:bg-red-900/30' :
            'bg-blue-100 dark:bg-blue-900/30'
          }`}>
            {verificationStatus === 'success' ? (
              <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : verificationStatus === 'error' ? (
              <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {verificationStatus === 'success' ? '인증 완료!' :
             verificationStatus === 'error' ? '인증 실패' :
             '이메일 인증'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {verificationStatus === 'success' ? '이메일 인증이 성공적으로 완료되었습니다' :
             verificationStatus === 'error' ? '이메일 인증에 문제가 발생했습니다' :
             provider ? `${getProviderDisplayName(provider)} 계정 연동을 위해 이메일 인증이 필요합니다` : '이메일 인증이 필요합니다'}
          </p>
        </div>

        {/* Content */}
        <div>
          {verificationStatus === 'success' ? (
            <div className="text-center">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 mb-6">
                <p className="text-green-700 dark:text-green-400 font-semibold text-lg mb-2">🎉 환영합니다!</p>
                <p className="text-gray-700 dark:text-gray-300 text-sm">
                  <strong className="text-indigo-600 dark:text-indigo-400">{userEmail}</strong> 계정이 성공적으로 인증되었습니다.
                </p>
              </div>
              <button
                onClick={handleGoToDashboard}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
              >
                시작하기
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          ) : verificationStatus === 'error' ? (
            <div className="text-center">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mb-6">
                <p className="text-red-700 dark:text-red-400 font-semibold text-lg mb-2">⚠️ 인증 실패</p>
                <p className="text-gray-700 dark:text-gray-300 text-sm">
                  {errorType === 'expired' ? '인증 링크가 만료되었습니다.' :
                   errorType === 'invalid' ? '유효하지 않은 인증 링크입니다.' :
                   errorType === 'network_error' ? '네트워크 오류가 발생했습니다.' :
                   '인증 처리 중 오류가 발생했습니다.'}
                </p>
              </div>

              <button
                onClick={handleGoToLogin}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200"
              >
                다시 로그인하기
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <p className="text-gray-900 dark:text-white font-medium text-lg mb-3">
                  인증 이메일을 발송했습니다! 📧
                </p>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  <strong className="text-indigo-600 dark:text-indigo-400">{userEmail}</strong>로 인증 링크를 발송했습니다.<br />
                  이메일을 확인하고 인증 링크를 클릭해주세요.
                </p>
              </div>

              {apiError && (
                <div className="text-red-600 dark:text-red-400 text-center text-sm mb-6 bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800 flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p>{apiError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-3">
                  <button
                    onClick={handleResendEmail}
                    disabled={isResending || resendCooldown > 0}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                  >
                    {isResending ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        전송 중...
                      </>
                    ) : resendCooldown > 0 ? `재전송 (${resendCooldown}초 후)` : '인증 이메일 재전송'}
                  </button>

                  <button
                    onClick={checkVerificationStatus}
                    disabled={isCheckingStatus}
                    className="w-full border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    {isCheckingStatus ? (
                      <>
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        확인 중...
                      </>
                    ) : '인증 상태 확인'}
                  </button>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm">
                      <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">이메일이 보이지 않나요?</p>
                      <ul className="text-amber-700 dark:text-amber-400 space-y-1">
                        <li>• 스팸 또는 정크 메일함을 확인해주세요</li>
                        <li>• 이메일 주소가 정확한지 확인해주세요</li>
                        <li>• 최대 5분 정도 소요될 수 있습니다</li>
                        <li>• 인증 링크는 1시간 후 만료됩니다</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 성공/에러 상태가 아닐 때만 하단 링크 표시 (중복 방지) */}
          {verificationStatus !== 'success' && verificationStatus !== 'error' && (
            <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-8">
              <Link href="/" onClick={handleGoToLogin} className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                로그인 페이지로 돌아가기
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SocialEmailVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-12">
          <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
            <div className="h-6 w-1/2 mx-auto mb-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-2/3 mx-auto bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />
            <div className="mt-8 space-y-3">
              <div className="h-12 w-full bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-12 w-full bg-gray-100 dark:bg-gray-600 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      }
    >
      <SocialEmailVerifyContent />
    </Suspense>
  );
}
