'use client'
import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ThemeToggle from '@/components/common/ThemeToggle'

function EmailChangeResultContent() {
  const params = useSearchParams()
  const router = useRouter()
  const verified = params.get('verified') === 'true'
  const error = params.get('error')
  const newEmail = params.get('new_email') || ''

  const title = verified
    ? '변경 완료'
    : error === 'expired'
      ? '링크 만료'
      : error === 'invalid'
        ? '잘못된 링크'
        : error === 'conflict'
          ? '이메일 중복'
          : '변경 실패'

  const desc = verified
    ? '이메일이 성공적으로 변경되었습니다.'
    : error === 'expired'
      ? '링크가 만료되었습니다.'
      : error === 'invalid'
        ? '유효하지 않은 링크입니다.'
        : error === 'conflict'
          ? '이미 사용 중인 이메일입니다.'
          : '이메일 변경에 실패했습니다.'

  const variant = verified
    ? 'success'
    : error === 'expired'
      ? 'warning'
      : error === 'conflict'
        ? 'orange'
        : 'danger'

  const circleBg = variant === 'success' ? 'bg-green-100 dark:bg-green-900/30'
    : variant === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30'
    : variant === 'orange' ? 'bg-orange-100 dark:bg-orange-900/30'
    : 'bg-red-100 dark:bg-red-900/30'

  const iconColor = variant === 'success' ? 'text-green-600 dark:text-green-400'
    : variant === 'warning' ? 'text-amber-600 dark:text-amber-400'
    : variant === 'orange' ? 'text-orange-600 dark:text-orange-400'
    : 'text-red-600 dark:text-red-400'

  const titleColor = variant === 'success' ? 'text-green-800 dark:text-green-300'
    : variant === 'warning' ? 'text-amber-800 dark:text-amber-300'
    : variant === 'orange' ? 'text-orange-800 dark:text-orange-300'
    : 'text-red-800 dark:text-red-300'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 py-12 relative">
      <div className="fixed top-6 right-6 z-10">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center transition-colors">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${circleBg}`}>
          {variant === 'success' && (
            <svg className={`w-8 h-8 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          )}
          {variant === 'warning' && (
            <svg className={`w-8 h-8 ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86l-8 14A2 2 0 004.18 21h15.64a2 2 0 001.89-3.14l-8-14a2 2 0 00-3.42 0z"/></svg>
          )}
          {variant === 'orange' && (
            <svg className={`w-8 h-8 ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M9.93 4.18l-7.76 13.5A2 2 0 004 21h16a2 2 0 001.83-3.32l-8-13.5a2 2 0 00-3.9 0z"/></svg>
          )}
          {variant === 'danger' && (
            <svg className={`w-8 h-8 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          )}
        </div>
        <h1 className={`text-2xl font-bold mb-2 ${titleColor}`}>{title}</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{desc}</p>
        {!verified && (
          <div className="space-y-3 mb-4">
            {error === 'expired' && (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">이메일을 다시 받으려면 아래 버튼을 눌러주세요.</p>
                <button
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:brightness-[0.90] dark:hover:brightness-100 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
                  onClick={()=>router.push('/profile')}
                >인증 메일 재전송</button>
              </>
            )}
            {error === 'invalid' && (
              <p className="text-sm text-gray-500 dark:text-gray-400">잘못된 링크입니다. 프로필에서 다시 요청해주세요.</p>
            )}
            {error === 'conflict' && (
              <p className="text-sm text-gray-500 dark:text-gray-400">이미 사용 중인 이메일입니다. 다른 이메일로 다시 요청해주세요.</p>
            )}
          </div>
        )}
        <button
          onClick={()=>router.push('/profile')}
          className="w-full bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 hover:border-indigo-500 dark:hover:border-indigo-400 text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-lg transition-all duration-200"
        >
          내 정보로 이동
        </button>
      </div>
    </div>
  )
}

export default function EmailChangeResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-4 py-12">
        <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
          <div className="h-6 w-1/2 mx-auto mb-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-2/3 mx-auto mb-6 bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />
          <div className="h-12 w-full bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
      </div>
    }>
      <EmailChangeResultContent />
    </Suspense>
  );
}

