'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { getApiUrl } from '@/lib/env';
import ThemeToggle from '@/components/common/ThemeToggle';

function ResetPasswordContent() {
  const [newPassword1, setNewPassword1] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [uid, setUid] = useState('')
  const [token, setToken] = useState('')
  const [isValidLink, setIsValidLink] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isValidating, setIsValidating] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const hasInitialized = useRef(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (hasInitialized.current) return;

    const uidParam = searchParams.get('uid')
    const tokenParam = searchParams.get('token')

    // 보안: URL에서 재설정 토큰을 즉시 제거한다. 쿼리에 남으면 브라우저 히스토리와
    // 서버 액세스 로그에 토큰이 기록돼 로그 열람자가 계정을 탈취할 수 있다.
    // 값은 이미 로컬 변수로 확보했으므로 기능 영향은 없다(OAuth 콜백과 동일한 스크럽).
    if (typeof window !== 'undefined' && (uidParam || tokenParam)) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    if (uidParam && tokenParam) {
      setUid(uidParam)
      setToken(tokenParam)
      validateToken(uidParam, tokenParam)
    } else {
      setErrorMessage('유효하지 않은 비밀번호 재설정 링크입니다.')
      setIsValidating(false)
      setTimeout(() => {
        router.push('/')
      }, 3000)
    }

    hasInitialized.current = true;
  }, [searchParams, router])

  const validateToken = async (uid: string, token: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/password/reset/validate/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uid, token }),
      })

      if (response.ok) {
        const data = await response.json()
        setIsValidLink(true)
        setUserEmail(data.email)
        toast.success('비밀번호 재설정 링크가 유효합니다.')
      } else {
        const data = await response.json()
        setIsValidLink(false)
        setErrorMessage(data.message || '토큰이 만료되었거나 유효하지 않습니다.')
        toast.error('비밀번호 재설정 링크가 만료되었습니다.')
      }
    } catch (error) {
      setIsValidLink(false)
      setErrorMessage('토큰 검증 중 오류가 발생했습니다.')
      toast.error('토큰 검증 중 오류가 발생했습니다.')
    } finally {
      setIsValidating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    if (newPassword1 !== newPassword2) {
      setErrorMessage('비밀번호가 일치하지 않습니다.')
      return
    }

    if (newPassword1.length < 8) {
      setErrorMessage('비밀번호는 최소 8자 이상이어야 합니다.')
      return
    }

    if (!/[a-zA-Z]/.test(newPassword1) || !/[0-9]/.test(newPassword1) || !/[^a-zA-Z0-9]/.test(newPassword1)) {
      setErrorMessage('비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`${getApiUrl()}/api/auth/password/reset/confirm/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid,
          token,
          new_password1: newPassword1,
          new_password2: newPassword2,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success('비밀번호가 성공적으로 재설정되었습니다.')

        if (data.requires_verification && data.verification_token) {
          router.push(`/email-verification?verification_token=${encodeURIComponent(data.verification_token)}`)
        } else {
          router.push('/')
        }
      } else {
        const data = await response.json()

        const errorMessages: string[] = [];

        if (data.new_password1) {
          const errors = Array.isArray(data.new_password1) ? data.new_password1 : [data.new_password1];
          errors.forEach((error: string) => errorMessages.push(`새 비밀번호: ${error}`));
        }
        if (data.new_password2) {
          const errors = Array.isArray(data.new_password2) ? data.new_password2 : [data.new_password2];
          errors.forEach((error: string) => errorMessages.push(`비밀번호 확인: ${error}`));
        }
        if (data.token) {
          const errors = Array.isArray(data.token) ? data.token : [data.token];
          errors.forEach((error: string) => errorMessages.push(`토큰: ${error}`));
        }
        if (data.uid) {
          const errors = Array.isArray(data.uid) ? data.uid : [data.uid];
          errors.forEach((error: string) => errorMessages.push(`사용자 ID: ${error}`));
        }
        if (data.non_field_errors) {
          const errors = Array.isArray(data.non_field_errors) ? data.non_field_errors : [data.non_field_errors];
          errors.forEach((error: string) => errorMessages.push(error));
        }

        const errorMsg = errorMessages.length > 0 ? errorMessages.join('\n') : '비밀번호 재설정에 실패했습니다.';
        setErrorMessage(errorMsg)
      }
    } catch (error) {
      setErrorMessage('네트워크 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 relative">
        <div className="fixed top-6 right-6 z-10">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors">
          <h1 className="text-center text-2xl font-semibold mb-8 text-gray-900 dark:text-white">
            비밀번호 재설정
          </h1>
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <svg className="animate-spin h-8 w-8 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">토큰을 검증하는 중...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isValidLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 relative">
        <div className="fixed top-6 right-6 z-10">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors">
          <h1 className="text-center text-2xl font-semibold mb-6 text-gray-900 dark:text-white">
            비밀번호 재설정
          </h1>
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-600 dark:text-red-400 text-center text-sm mb-8">
              {errorMessage || '토큰이 만료되었거나 유효하지 않습니다.'}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => router.push('/password-reset')}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                새 비밀번호 재설정 이메일 요청
              </button>

              <button
                onClick={() => router.push('/')}
                className="w-full bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 hover:border-indigo-500 dark:hover:border-indigo-400 text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-lg transition-all duration-200"
              >
                로그인 페이지로 돌아가기
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 relative">
      <div className="fixed top-6 right-6 z-10">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors">
        <h1 className="text-center text-2xl font-semibold mb-6 text-gray-900 dark:text-white">
          비밀번호 재설정
        </h1>

        <form onSubmit={handleSubmit}>
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">새로운 비밀번호를 입력해주세요</p>
          </div>

          {userEmail && (
            <div className="text-center mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                계정: <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{userEmail}</span>
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg">
              {errorMessage.split('\n').map((line, index) => (
                <p key={index} className="text-red-600 dark:text-red-400 text-center text-sm mb-1 last:mb-0">{line}</p>
              ))}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="newPassword1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                새 비밀번호
              </label>
              <input
                id="newPassword1"
                type="password"
                value={newPassword1}
                onChange={(e) => setNewPassword1(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                placeholder="8자 이상, 영문/숫자/특수문자 조합"
                autoComplete="new-password"
                required
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">8자 이상, 영문/숫자/특수문자 조합</p>
            </div>

            <div>
              <label htmlFor="newPassword2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                비밀번호 확인
              </label>
              <input
                id="newPassword2"
                type="password"
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                placeholder="비밀번호를 다시 입력해주세요"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                재설정 중...
              </>
            ) : (
              '비밀번호 재설정'
            )}
          </button>

          <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-8">
            비밀번호를 기억하시나요?{' '}
            <Link href="/" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
              로그인
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <div className="h-8 w-2/3 mx-auto mb-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="space-y-4">
              <div className="h-12 w-full bg-gray-100 dark:bg-gray-600 rounded-lg animate-pulse" />
              <div className="h-12 w-full bg-gray-100 dark:bg-gray-600 rounded-lg animate-pulse" />
              <div className="h-12 w-full bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
