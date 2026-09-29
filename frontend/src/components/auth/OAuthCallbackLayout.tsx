'use client';

import { getProviderDisplayName } from '@/lib/oauth';

interface OAuthLoadingStateProps {
  provider: string;
  action: 'login' | 'connect';
}

/**
 * OAuth 콜백 로딩 상태 UI
 */
export function OAuthLoadingState({ provider, action }: OAuthLoadingStateProps) {
  const actionText = action === 'login' ? '로그인' : '계정 연결';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-6 relative">
          <div className="absolute inset-0 border-4 border-indigo-200 dark:border-indigo-800 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-indigo-600 dark:border-indigo-400 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {getProviderDisplayName(provider)} {actionText} 처리 중
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          잠시만 기다려주세요...
        </p>
      </div>
    </div>
  );
}

interface OAuthErrorStateProps {
  message: string;
  returnPath: string;
  buttonText: string;
  onReturn: () => void;
}

/**
 * OAuth 콜백 에러 상태 UI
 */
export function OAuthErrorState({ message, buttonText, onReturn }: OAuthErrorStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          처리 실패
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {message}
        </p>
        <button
          onClick={onReturn}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
