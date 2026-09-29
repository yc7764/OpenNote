'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getApiUrl } from '@/lib/env';
import ErrorAlert from '@/components/common/ErrorAlert';
import ThemeToggle from '@/components/common/ThemeToggle';

export default function PasswordResetPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formError, setFormError] = useState('');
  const router = useRouter();

  const validateForm = () => {
    if (!email) {
      setFormError('이메일을 입력해주세요.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setFormError('올바른 이메일 형식이 아닙니다.');
      return false;
    }
    setFormError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${getApiUrl()}/api/auth/password/reset/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setIsEmailSent(true);
      } else {
        const data = await response.json();
        const errorMsg = data.detail || data.email?.[0] || '이메일 전송에 실패했습니다.';
        setErrorMessage(errorMsg);
      }
    } catch (error) {
      setErrorMessage('네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isEmailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 relative">
        {/* Theme Toggle - Page Top Right */}
        <div className="fixed top-6 right-6 z-10">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors">
          <div className="text-center">
            {/* Success Icon */}
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              재설정 링크 전송 완료
            </h1>

            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-2">
              비밀번호 재설정 링크가 이메일로 전송되었습니다.
            </p>

            <p className="text-amber-600 dark:text-amber-400 font-medium mb-8 text-sm">
              ⏱️ 링크는 10분 후에 만료됩니다!
            </p>

            <button
              onClick={() => router.push('/')}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
            >
              로그인으로 돌아가기
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            비밀번호 재설정
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            회원가입 시 등록한 이메일을 입력하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {errorMessage && <ErrorAlert lines={errorMessage.split('\n')} />}

          {/* Email Input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
              이메일
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일을 입력하세요"
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
              />
            </div>
            {formError && (
              <p className="mt-1 text-xs text-red-500">{formError}</p>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              등록된 이메일 주소로 재설정 링크가 발송됩니다
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                전송 중...
              </>
            ) : (
              <>
                비밀번호 재설정 링크 전송
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>

          {/* Links */}
          <div className="text-center text-sm text-gray-600 dark:text-gray-400 space-y-2 pt-4">
            <div>
              회원이 아니신가요?{' '}
              <Link href="/signup" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                회원가입
              </Link>
            </div>
            <div>
              비밀번호를 기억하시나요?{' '}
              <Link href="/" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                로그인
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
