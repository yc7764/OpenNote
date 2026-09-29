'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/config';
import ThemeToggle from '@/components/common/ThemeToggle';

/**
 * 소셜 로그인 후 이메일 입력 페이지
 *
 * 소셜 프로바이더에서 이메일을 제공하지 않은 경우
 * 사용자에게 이메일 입력을 요청합니다.
 * 이메일 입력 후 인증 이메일을 발송하고 인증 페이지로 이동합니다.
 */
export default function SocialEmailRequiredPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>('');

  useEffect(() => {
    // 임시 토큰은 HttpOnly 쿠키에 있어 JS로 못 읽는다. 흐름 진입 여부는
    // 콜백에서 심은 비민감 마커(social_provider)로 판정한다.
    const prov = sessionStorage.getItem('social_provider');

    if (!prov) {
      // 소셜 흐름 마커가 없으면 로그인 페이지로 리다이렉트
      router.push('/');
      return;
    }

    setProvider(prov);
  }, [router]);

  const getProviderDisplayName = (provider: string): string => {
    const names: Record<string, string> = {
      google: 'Google',
      github: 'GitHub',
      naver: 'Naver',
      kakao: 'Kakao',
    };
    return names[provider] || provider;
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError('이메일 주소를 입력해주세요.');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setError('유효한 이메일 주소를 입력해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/social/submit-email/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // 임시 토큰은 HttpOnly 쿠키로 자동 전송된다.
        credentials: 'include',
        body: JSON.stringify({
          email: trimmedEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '이메일 설정에 실패했습니다.');
      }

      // 인증 필요 응답인 경우 인증 페이지로 이동
      if (data.verification_required) {
        // 세션에 인증 정보 저장 (temp_token 유지, 이메일 정보 추가)
        sessionStorage.setItem('social_pending_email', data.email);
        // 소셜 이메일 인증 페이지로 이동
        router.push('/auth/social-email-verify');
        return;
      }

      // 기존 로직 (이전 버전 호환성 - 인증 없이 바로 완료되는 경우)
      // 세션 정리 (임시 토큰은 서버 쿠키라 여기서 지울 것 없음)
      sessionStorage.removeItem('social_provider');

      // 대시보드로 리다이렉트
      router.push('/dashboard');

    } catch (err) {
      setError(err instanceof Error ? err.message : '이메일 설정 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // 세션 정리 후 로그인 페이지로 이동 (임시 토큰은 서버 쿠키가 30분 후 자동 만료)
    sessionStorage.removeItem('social_provider');
    sessionStorage.removeItem('social_pending_email');
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        {/* 헤더 아이콘 */}
        <div className="w-16 h-16 mx-auto mb-6 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
          <svg
            className="w-8 h-8 text-indigo-600 dark:text-indigo-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        {/* 타이틀 */}
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">
          이메일 주소 입력
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          {provider && (
            <span className="font-medium text-indigo-600 dark:text-indigo-400">
              {getProviderDisplayName(provider)}
            </span>
          )}
          {' '}계정에서 이메일 정보를 가져올 수 없습니다.
          <br />
          계정 복구 및 알림을 위해 이메일을 입력해주세요.
        </p>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* 이메일 입력 폼 */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              이메일 주소
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         placeholder-gray-400 dark:placeholder-gray-500
                         transition-colors"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                         text-white font-semibold py-3 px-4 rounded-lg
                         transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  처리 중...
                </>
              ) : (
                '계속하기'
              )}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
                         text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-lg
                         transition-colors"
            >
              취소
            </button>
          </div>
        </form>

        {/* 안내 문구 */}
        <p className="mt-6 text-xs text-center text-gray-500 dark:text-gray-400">
          입력하신 이메일은 계정 복구, 중요 알림, 보안 관련 통지에 사용됩니다.
        </p>
      </div>
    </div>
  );
}
