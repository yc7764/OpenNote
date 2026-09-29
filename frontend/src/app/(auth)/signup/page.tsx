'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatApiError } from '@/lib/format';
import { getApiUrl } from '@/lib/env';
import ErrorAlert from '@/components/common/ErrorAlert';
import ThemeToggle from '@/components/common/ThemeToggle';
import { toast } from 'sonner';

interface SignupFormErrors {
  username?: string;
  email?: string;
  password1?: string;
  password2?: string;
}

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<SignupFormErrors>({});
  const router = useRouter();

  const validateForm = (): boolean => {
    const newErrors: SignupFormErrors = {};

    if (!username) {
      newErrors.username = '사용자 아이디를 입력해주세요.';
    }
    if (!email) {
      newErrors.email = '이메일을 입력해주세요.';
    }
    if (!password1) {
      newErrors.password1 = '비밀번호를 입력해주세요.';
    } else if (password1.length < 8) {
      newErrors.password1 = '비밀번호는 최소 8자 이상이어야 합니다.';
    } else if (!/[a-zA-Z]/.test(password1) || !/[0-9]/.test(password1) || !/[^a-zA-Z0-9]/.test(password1)) {
      newErrors.password1 = '비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.';
    }
    if (!password2) {
      newErrors.password2 = '비밀번호 확인을 입력해주세요.';
    }
    if (password1 && password2 && password1 !== password2) {
      newErrors.password2 = '비밀번호가 일치하지 않습니다.';
    }

    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) {
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/auth/registration/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          username,
          email,
          password1,
          password2,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw data;
      }

      // 회원가입 성공 시 토큰을 사용하여 이메일 인증 페이지로 이동
      if (data.verification_token) {
        router.push(`/email-verification?verification_token=${data.verification_token}`);
      } else {
        // 토큰이 없는 경우 (예외 상황)
        router.push(`/email-verification?email=${encodeURIComponent(email)}`);
      }
      toast.success('회원가입이 완료되었습니다. 이메일을 확인해주세요.');

    } catch (error: unknown) {
      const fullError = formatApiError(error);
      setApiError(fullError);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 py-8 relative">
      {/* Theme Toggle - Page Top Right */}
      <div className="fixed top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            회원가입
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            새로운 계정을 만들어보세요
          </p>
        </div>

        <form onSubmit={handleSignup} noValidate className="space-y-5">
          {apiError && <ErrorAlert lines={apiError.split('\n')} />}

          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                이름 (First Name)
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="이름"
                autoComplete="given-name"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                성 (Last Name)
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="성"
                autoComplete="family-name"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
              />
            </div>
          </div>

          {/* Username Input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
              사용자 아이디
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="사용자 아이디"
                autoComplete="username"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
              />
            </div>
            {formErrors.username && (
              <p className="mt-1 text-xs text-red-500">{formErrors.username}</p>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              영문, 숫자, 특수문자(_)만 사용 가능
            </p>
          </div>

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
                placeholder="이메일"
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
              />
            </div>
            {formErrors.email && (
              <p className="mt-1 text-xs text-red-500">{formErrors.email}</p>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
              비밀번호
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                type={showPassword1 ? "text" : "password"}
                value={password1}
                onChange={(e) => setPassword1(e.target.value)}
                placeholder="비밀번호"
                autoComplete="new-password"
                className="w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword1(!showPassword1)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showPassword1 ? (
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
            {formErrors.password1 && (
              <p className="mt-1 text-xs text-red-500">{formErrors.password1}</p>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              8자 이상, 영문/숫자/특수문자 조합
            </p>
          </div>

          {/* Password Confirmation Input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
              비밀번호 확인
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <input
                type={showPassword2 ? "text" : "password"}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="비밀번호 확인"
                autoComplete="new-password"
                className="w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword2(!showPassword2)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showPassword2 ? (
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
            {formErrors.password2 && (
              <p className="mt-1 text-xs text-red-500">{formErrors.password2}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
          >
            계정 생성
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>

          {/* Sign In Link */}
          <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
            이미 회원이신가요?{' '}
            <Link href="/" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
              로그인
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
