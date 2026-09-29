'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatApiError } from '@/lib/format';
import { getApiUrl } from '@/lib/env';
import ThemeToggle from '@/components/common/ThemeToggle';

function EmailVerificationContent() {
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isCheckingManually, setIsCheckingManually] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isFromLogin, setIsFromLogin] = useState<boolean>(false);
  const hasInitialized = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // 이미 초기화된 경우 중복 실행 방지
    if (hasInitialized.current) return;

    // URL에서 파라미터 가져오기
    const tokenParam = searchParams.get('token');
    const verified = searchParams.get('verified');
    const error = searchParams.get('error');
    const verificationToken = searchParams.get('verification_token');

    // M8: 인증 토큰이 URL에 남으면 브라우저 히스토리·서버 액세스 로그·Referer에
    // 잔존해 재사용될 수 있다. 값을 변수에 담은 직후 주소에서 지운다(reset-password·
    // OAuth 콜백 등 다른 인증 페이지와 동일 패턴). 결과 플래그만 있는 경우는 대상 아님.
    if (typeof window !== 'undefined' && (tokenParam || verificationToken)) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (verified === 'true' && tokenParam) {
      // 토큰에서 이메일 정보 추출 (백엔드에서 토큰 검증 후 이메일 반환)
      fetchEmailFromToken(tokenParam, false);
    } else if (verified === 'false') {
      setVerificationStatus('error');
      setErrorType(error || 'unknown');
      if (error === 'expired') {
        toast.error('인증 링크가 만료되었습니다. 새로운 인증 이메일을 요청해주세요.');
      } else if (error === 'invalid') {
        toast.error('유효하지 않은 인증 링크입니다.');
      } else {
        toast.error('인증에 실패했습니다.');
      }
    } else if (verificationToken) {
      // 로그인에서 리다이렉트된 경우 (토큰 기반)
      fetchEmailFromToken(verificationToken, true);
      setIsFromLogin(true);
      // 토스트는 fetchEmailFromToken 내부에서 처리
    }

    // 초기화 완료 표시
    hasInitialized.current = true;
  }, [searchParams.toString()]);

  useEffect(() => {
    // 재전송 쿨다운 타이머
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const fetchEmailFromToken = async (token: string, isFromLoginToken: boolean = false) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/email/verify-token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        const data = await response.json();
        setUserEmail(data.email);

        // 토큰 타입에 따라 다른 처리
        if (data.is_verified) {
          // 이미 인증된 사용자 (완료 토큰)
          setVerificationStatus('success');
          toast.success('이메일 인증이 완료되었습니다!');
        } else if (data.requires_verification) {
          // 인증이 필요한 사용자 (요청 토큰)
          setVerificationStatus('pending');
          // 로그인에서 온 경우에만 토스트 표시
          if (isFromLoginToken) {
            toast.info('이메일 인증이 필요합니다. 인증 이메일을 확인해주세요.');
          }
        } else {
          // 기타 경우
          setVerificationStatus('pending');
        }
      } else {
        setVerificationStatus('error');
        setErrorType('invalid_token');
        toast.error('유효하지 않은 인증 토큰입니다.');
      }
    } catch (error) {
      setVerificationStatus('error');
      setErrorType('network_error');
      toast.error('토큰 검증 중 오류가 발생했습니다.');
    }
  };

  const handleResendEmail = async () => {
    if (!userEmail) {
      setApiError('이메일 정보를 찾을 수 없습니다. 로그인 페이지에서 재전송해주세요.');
      return;
    }

    setIsResending(true);
    setApiError(null);

    try {
      const response = await fetch(`${getApiUrl()}/api/auth/email/resend/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw data;
      }

      toast.success('인증 이메일이 재전송되었습니다. 이메일을 확인해주세요.');
      setResendCooldown(60); // 60초 쿨다운
      setVerificationStatus('pending'); // 재전송 후 대기 상태로 변경

    } catch (error: unknown) {
      const errorMessage = formatApiError(error);
      setApiError(errorMessage);
      toast.error('이메일 재전송에 실패했습니다.');
    } finally {
      setIsResending(false);
    }
  };

  const checkVerificationStatus = async () => {
    if (!userEmail) {
      toast.error('이메일 정보를 찾을 수 없습니다.');
      return;
    }

    setIsCheckingManually(true);

    try {
      const response = await fetch(`${getApiUrl()}/api/auth/email/verify-status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await response.json();

      if (response.ok && data.is_verified) {
        setVerificationStatus('success');
        toast.success('이메일 인증이 완료되었습니다!');
      } else {
        toast.info('아직 이메일 인증이 완료되지 않았습니다.');
      }
    } catch (error) {
      toast.error('인증 상태 확인에 실패했습니다.');
    } finally {
      setIsCheckingManually(false);
    }
  };

  const handleGoToLogin = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 py-12 relative">
      {/* Theme Toggle - Page Top Right */}
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
             '회원가입을 완료하려면 이메일 인증이 필요합니다'}
          </p>
        </div>

        {/* Content */}
        <div>
          {verificationStatus === 'success' ? (
            <div className="text-center">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 mb-6">
                <p className="text-green-700 dark:text-green-400 font-semibold text-lg mb-2">🎉 축하합니다!</p>
                <p className="text-gray-700 dark:text-gray-300 text-sm">
                  <strong className="text-indigo-600 dark:text-indigo-400">{userEmail}</strong> 계정이 성공적으로 인증되었습니다.
                </p>
              </div>
              <button
                onClick={handleGoToLogin}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
              >
                로그인하기
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
                   errorType === 'invalid_token' ? '유효하지 않은 인증 토큰입니다.' :
                   errorType === 'network_error' ? '네트워크 오류가 발생했습니다.' :
                   '인증 처리 중 오류가 발생했습니다.'}
                </p>
              </div>

              <div className="space-y-3">
                {userEmail && (
                  <button
                    onClick={handleResendEmail}
                    disabled={isResending || resendCooldown > 0}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                  >
                    {isResending ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        전송 중...
                      </>
                    ) : resendCooldown > 0 ? `새 인증 이메일 전송 (${resendCooldown}초 후)` : '새 인증 이메일 전송'}
                  </button>
                )}

                <button
                  onClick={() => router.push('/')}
                  className="w-full border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200"
                >
                  로그인 페이지로 돌아가기
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <p className="text-gray-900 dark:text-white font-medium text-lg mb-3">
                  {isFromLogin ? '이메일 인증이 필요합니다! 📧' : '회원가입이 완료되었습니다! 📧'}
                </p>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  <strong className="text-indigo-600 dark:text-indigo-400">{userEmail || '귀하의 이메일'}</strong>로 인증 링크를 발송했습니다.<br />
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
                  {userEmail && (
                    <button
                      onClick={handleResendEmail}
                      disabled={isResending || resendCooldown > 0}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                    >
                      {isResending ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          전송 중...
                        </>
                      ) : resendCooldown > 0 ? `재전송 (${resendCooldown}초 후)` : '인증 이메일 재전송'}
                    </button>
                  )}

                  {userEmail && (
                    <button
                      onClick={checkVerificationStatus}
                      disabled={isCheckingManually}
                      className="w-full border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 flex items-center justify-center gap-2"
                    >
                      {isCheckingManually ? (
                        <>
                          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          확인 중...
                        </>
                      ) : '인증 상태 확인'}
                    </button>
                  )}
                </div>

                {isFromLogin && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <div className="text-sm">
                        <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1">로그인을 위해 이메일 인증이 필요합니다</p>
                        <p className="text-blue-700 dark:text-blue-400">
                          계정 보안을 위해 이메일 인증을 완료한 후 로그인할 수 있습니다.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

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
                        {isFromLogin && <li>• 이메일을 받지 못했다면 재전송 버튼을 사용해주세요</li>}
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
              <Link href="/" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                로그인 페이지로 돌아가기
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmailVerificationPage() {
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
      <EmailVerificationContent />
    </Suspense>
  );
}
