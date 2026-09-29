'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatApiError } from '@/lib/format';
import { login, getSocialLoginUrl } from '@/services/auth';
import { checkAuthStatus } from '@/lib/apiClient';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import ErrorAlert from '@/components/common/ErrorAlert';
import ThemeToggle from '@/components/common/ThemeToggle';
import { SocialProviderIcon, SOCIAL_PROVIDER_BRAND } from '@/components/icons';
import type { SocialProvider } from '@/types/auth';

// 허용된 OAuth 도메인 화이트리스트 (보안)
const ALLOWED_OAUTH_DOMAINS = [
  'accounts.google.com',
  'github.com',
  'nid.naver.com',
  'kauth.kakao.com',
];

// 로그인 버튼 노출 순서
const SOCIAL_LOGIN_PROVIDERS: SocialProvider[] = ['google', 'github', 'naver', 'kakao'];

/**
 * OAuth URL 도메인 검증
 * 리다이렉트 전 허용된 OAuth 프로바이더 도메인인지 확인
 */
function isAllowedOAuthDomain(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_OAUTH_DOMAINS.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
}

/**
 * 소셜 로그인 핸들러
 * 보안: 리다이렉트 전 도메인 검증
 */
function handleSocialLogin(provider: SocialProvider): void {
  const loginUrl = getSocialLoginUrl(provider);
  if (isAllowedOAuthDomain(loginUrl)) {
    window.location.href = loginUrl;
  }
  // 유효하지 않은 URL인 경우 리다이렉트하지 않음 (silent fail for security)
}

function HomePageContent() {
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{ login?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loadMe } = useAuth();

  // Check if user is already logged in and handle social auth errors
  useEffect(() => {
    // 세션 만료 처리 (보안: sessionStorage 사용 - URL 파라미터 대신)
    const sessionExpired = sessionStorage.getItem('auth_session_expired');
    if (sessionExpired === 'true') {
      setApiError('세션이 만료되었습니다. 다시 로그인해주세요.');
      sessionStorage.removeItem('auth_session_expired');  // 읽은 후 제거
      return;
    }

    // 레거시: URL 파라미터 지원 (향후 제거 예정)
    const expired = searchParams.get('expired');
    if (expired === 'true') {
      setApiError('세션이 만료되었습니다. 다시 로그인해주세요.');
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      return;
    }

    // 에러 처리 - URL에 error 파라미터가 있을 때만 에러 표시
    const error = searchParams.get('error');
    if (error) {
      const errorMessages: { [key: string]: string } = {
        'social_auth_failed': '소셜 로그인에 실패했습니다. 다시 시도해주세요.',
        'social_auth_error': '소셜 로그인 중 오류가 발생했습니다.',
        'auth_failed': '인증에 실패했습니다. 다시 시도해주세요.',
        'token_error': '토큰 생성 중 오류가 발생했습니다.',
        'missing_backend': '지원하지 않는 소셜 서비스입니다.',
        'auth_forbidden': '접근이 거부되었습니다.',
        'unsupported_provider': '지원하지 않는 소셜 서비스입니다.',
      };

      setApiError(errorMessages[error] || '알 수 없는 오류가 발생했습니다.');

      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      return;
    }

    // HttpOnly 쿠키 기반 인증 상태 확인 (서버에 요청)
    // 언마운트 후 늦게 도착한 응답으로 router.push가 실행되지 않도록 취소 플래그 처리
    let cancelled = false;
    checkAuthStatus().then((isAuthenticated) => {
      if (!cancelled && isAuthenticated) {
        router.push('/dashboard');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  const validateForm = () => {
    const errors: { login?: string; password?: string } = {};
    if (!loginIdentifier) {
      errors.login = 'Please enter your email or username.';
    }
    if (!password) {
      errors.password = 'Please enter your password.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // L10: 처리 중 재진입 차단. 더블클릭 시 로그인 POST가 중복되면 오입력의 경우
    // 백엔드 실패 카운터가 이중 차감돼 정상보다 빨리 락아웃될 수 있다.
    if (isSubmitting) return;
    setApiError(null);
    setFormErrors({});

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await login(loginIdentifier, password);
      if (data?.requires_verification && data?.verification_token) {
        router.push(`/email-verification?verification_token=${encodeURIComponent(data.verification_token)}`);
        return;
      }
      // JWT 토큰은 HttpOnly 쿠키로 자동 설정됨 (localStorage 저장 불필요)
      // AuthProvider는 루트 layout에 있어 네비게이션 시 리마운트되지 않으므로,
      // 로그인 직후 AuthContext의 user 상태를 직접 갱신해야 함.
      // 이를 누락하면 /dashboard의 AuthGuard가 stale한 user=null을 보고
      // 다시 '/'로 리다이렉트 → checkAuthStatus 성공 → /dashboard 무한 루프(화면 깜빡임)가 발생함.
      await loadMe();
      router.push('/dashboard');
    } catch (error: unknown) {
      setApiError(formatApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 relative">
      {/* Theme Toggle - Page Top Right */}
      <div className="fixed top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            환영합니다
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            계정 정보를 입력하여 로그인하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {apiError && (<ErrorAlert lines={apiError.split('\n')} />)}

          {/* Email Input */}
          <div>
            <label htmlFor="login-identifier" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
              이메일 또는 유저명
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                id="login-identifier"
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="이메일 또는 유저명을 입력하세요"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
              />
            </div>
            {formErrors.login && (
              <p className="mt-1 text-xs text-red-500">{formErrors.login}</p>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
              비밀번호
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showPassword ? (
                  <svg className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                )}
              </button>
            </div>
            {formErrors.password && (
              <p className="mt-1 text-xs text-red-500">{formErrors.password}</p>
            )}
            <div className="mt-2 text-right">
              <Link href="/password-reset" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                비밀번호를 잊으셨나요?
              </Link>
            </div>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-lg"
          >
            {isSubmitting ? '로그인 중…' : '로그인'}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>

          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
            <span className="mx-4 text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">또는</span>
            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
          </div>

          {/* Social Login Buttons */}
          <div className="grid grid-cols-4 gap-3">
            {SOCIAL_LOGIN_PROVIDERS.map((provider) => {
              const brand = SOCIAL_PROVIDER_BRAND[provider];
              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => handleSocialLogin(provider)}
                  aria-label={`${brand.name} 계정으로 로그인`}
                  className={`flex items-center justify-center p-3 border border-gray-300 dark:border-gray-500 rounded-lg transition-opacity hover:opacity-80 shadow-sm ${brand.containerClass} ${brand.symbolClass}`}
                >
                  <SocialProviderIcon provider={provider} className="w-6 h-6" />
                </button>
              );
            })}
          </div>

          {/* Sign Up Link */}
          <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
            계정이 없으신가요? <Link href="/signup" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">회원가입</Link>
          </div>
        </form>

        {/* Footer Links */}
        <div className="flex flex-col items-center gap-2 sm:gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/terms" className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              이용약관
            </Link>
            <span className="text-gray-300 dark:text-gray-600 text-[10px] sm:text-xs">•</span>
            <Link href="/privacy" className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              개인정보처리방침
            </Link>
            <span className="text-gray-300 dark:text-gray-600 text-[10px] sm:text-xs">•</span>
            <Link href="/about" className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              About
            </Link>
          </div>
          <a
            href="mailto:dudcjf7764@naver.com"
            className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
          >
            <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            버그 제보 · 문의: dudcjf7764@naver.com
          </a>
          <a
            href="https://yc7764.tistory.com/category/OpenNote"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            개발 블로그
          </a>
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">
            <span>기여자:</span>
            <a href="mailto:kunj0312@gmail.com" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">kunj0312@gmail.com</a>
            <Link href="/about" className="hover:text-indigo-600 dark:hover:text-indigo-400">외 3명</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-[400px] bg-white rounded-2xl shadow-lg p-10">
            <div className="skeleton-line h-8 w-1/3 mx-auto mb-8" />
            <div className="space-y-5">
              <div className="skeleton-line h-10 w-full" />
              <div className="skeleton-line h-10 w-full" />
              <div className="skeleton-line h-12 w-full" />
              <div className="skeleton-line h-12 w-full" />
            </div>
          </div>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
