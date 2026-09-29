'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { SocialProvider, LinkedAccountsResponse } from '@/types/auth';
import {
  fetchLinkedAccounts,
  disconnectSocialAccount,
  getSocialLoginUrl,
  prepareSocialConnect,
} from '@/services/auth';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { SocialProviderIcon, SOCIAL_PROVIDER_BRAND } from '@/components/icons';

// 허용된 OAuth 도메인 화이트리스트 (보안)
const ALLOWED_OAUTH_DOMAINS = [
  'accounts.google.com',
  'github.com',
  'nid.naver.com',
  'kauth.kakao.com',
];

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

// 프로바이더 이름·컨테이너 배경·심볼 색상은 브랜드 규격이라 icons 모듈이 정본이다.
const PROVIDER_CONFIG = SOCIAL_PROVIDER_BRAND;

interface LinkedAccountsProps {
  className?: string;
}

export const LinkedAccountsSection: React.FC<LinkedAccountsProps> = ({
  className,
}) => {
  const [data, setData] = useState<LinkedAccountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<SocialProvider | null>(null);

  // 비밀번호 확인 모달 상태
  const [unlinkModal, setUnlinkModal] = useState<{
    isOpen: boolean;
    provider: SocialProvider | null;
    password: string;
  }>({ isOpen: false, provider: null, password: '' });


  const loadLinkedAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchLinkedAccounts();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결된 계정을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLinkedAccounts();
  }, [loadLinkedAccounts]);

  const [linkingProvider, setLinkingProvider] = useState<SocialProvider | null>(null);
  const confirm = useConfirm();

  const handleLink = async (provider: SocialProvider) => {
    setLinkingProvider(provider);
    setError(null);

    try {
      // OAuth 플로우:
      // 0. 서버에서 CSRF state를 발급받아 OAuth URL에 싣는다(콜백 POST에서 대조)
      // 1. 프론트엔드에서 직접 OAuth URL로 리다이렉트 (connect mode)
      // 2. 콜백 페이지에서 code+state를 받아 백엔드로 전송
      // 3. 백엔드에서 state 검증 후 기존 사용자에게 소셜 계정 연결
      const serverState = await prepareSocialConnect(provider);
      const connectUrl = getSocialLoginUrl(provider, 'connect', serverState);

      // 보안: 리다이렉트 전 도메인 검증
      if (!isAllowedOAuthDomain(connectUrl)) {
        throw new Error('유효하지 않은 OAuth URL입니다.');
      }

      window.location.href = connectUrl;
    } catch (err) {
      setLinkingProvider(null);
      const error = err as { error?: string; message?: string };
      setError(error.message || '소셜 계정 연결을 시작할 수 없습니다.');
    }
  };

  const handleUnlink = async (provider: SocialProvider) => {
    // 비밀번호가 있는 사용자는 모달로 비밀번호 확인 필요
    if (data?.has_password) {
      setUnlinkModal({ isOpen: true, provider, password: '' });
      return;
    }

    // 비밀번호가 없는 사용자는 확인만 하고 진행
    const ok = await confirm({
      title: '계정 연결 해제',
      description: `${PROVIDER_CONFIG[provider].name} 계정 연결을 해제하시겠습니까?`,
      confirmText: '해제',
      tone: 'danger',
    });
    if (!ok) return;

    await performUnlink(provider);
  };

  const performUnlink = async (provider: SocialProvider, _password?: string) => {
    try {
      setUnlinkingProvider(provider);
      // dj-rest-auth 기반 disconnect API 사용
      await disconnectSocialAccount(provider);
      await loadLinkedAccounts();
      setUnlinkModal({ isOpen: false, provider: null, password: '' });
    } catch (err) {
      const error = err as { password?: string[]; detail?: string; message?: string };
      const errorMsg = error.password?.[0] || error.detail || error.message || '연결 해제에 실패했습니다.';
      setError(errorMsg);
    } finally {
      setUnlinkingProvider(null);
    }
  };

  const handleUnlinkModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlinkModal.provider) return;
    await performUnlink(unlinkModal.provider, unlinkModal.password);
  };

  if (loading) {
    return (
      <div className={cn('animate-pulse', className)}>
        <div className="h-5 tablet:h-6 bg-neutral-200 dark:bg-neutral-700 rounded w-1/3 mb-3 tablet:mb-4" />
        <div className="space-y-2 tablet:space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 tablet:h-14 bg-neutral-100 dark:bg-neutral-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4 bg-red-50 dark:bg-red-900/20 rounded-lg', className)}>
        <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        <button
          onClick={loadLinkedAccounts}
          className="mt-2 text-sm text-red-700 dark:text-red-300 underline hover:no-underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) return null;

  const linkedCount = data.linked_accounts.length;

  return (
    <div className={cn('flex flex-col', className)}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 tablet:mb-4">
        <div>
          <h3 className="text-sm tablet:text-base font-semibold text-neutral-900 dark:text-neutral-50">
            연결된 계정
          </h3>
          <p className="text-xs tablet:text-sm text-neutral-500 dark:text-neutral-400">
            {linkedCount}개의 소셜 계정이 연결됨
          </p>
        </div>
      </div>

      {/* 연결된 계정 목록 - flex-1로 확장 */}
      <div className="flex-1 space-y-1.5 tablet:space-y-2">
        {data.available_providers.map((provider) => {
          const config = PROVIDER_CONFIG[provider.provider];
          const linkedAccount = data.linked_accounts.find(
            (acc) => acc.provider === provider.provider
          );

          // config가 없으면 렌더링하지 않음 (알 수 없는 provider)
          if (!config) {
            return null;
          }

          return (
            <div
              key={provider.provider}
              className={cn(
                'flex items-center justify-between p-2.5 tablet:p-3 desktop:p-4 rounded-lg border',
                'border-neutral-200 dark:border-neutral-700',
                'bg-white dark:bg-neutral-800'
              )}
            >
              <div className="flex items-center gap-2 tablet:gap-3 min-w-0">
                <div className={cn('p-1.5 tablet:p-2 rounded-lg flex-shrink-0', config.containerClass, config.symbolClass)}>
                  <SocialProviderIcon
                    provider={provider.provider}
                    className="w-4 h-4 tablet:w-5 tablet:h-5"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm tablet:text-base font-medium text-neutral-900 dark:text-neutral-50 truncate">
                    {config.name}
                  </p>
                  {linkedAccount && (
                    <p className="text-xs tablet:text-sm text-neutral-500 dark:text-neutral-400 truncate">
                      {linkedAccount.social_email || '연결됨'}
                    </p>
                  )}
                </div>
              </div>

              {provider.is_linked ? (
                <button
                  onClick={() => handleUnlink(provider.provider)}
                  disabled={!linkedAccount?.can_unlink || unlinkingProvider === provider.provider}
                  className={cn(
                    'px-2.5 py-1.5 tablet:px-3 tablet:py-2 text-xs tablet:text-sm font-medium rounded-lg transition-colors flex-shrink-0',
                    linkedAccount?.can_unlink
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-neutral-400 dark:text-neutral-500 cursor-not-allowed',
                    unlinkingProvider === provider.provider && 'opacity-50'
                  )}
                  title={!linkedAccount?.can_unlink ? '마지막 인증 수단은 해제할 수 없습니다' : undefined}
                >
                  {unlinkingProvider === provider.provider ? '해제 중...' : '해제'}
                </button>
              ) : (
                <button
                  onClick={() => handleLink(provider.provider)}
                  disabled={linkingProvider !== null}
                  className={cn(
                    'px-2.5 py-1.5 tablet:px-3 tablet:py-2 text-xs tablet:text-sm font-medium rounded-lg transition-colors flex-shrink-0',
                    'text-primary-600 dark:text-primary-400',
                    'hover:bg-primary-50 dark:hover:bg-primary-900/20',
                    linkingProvider === provider.provider && 'opacity-50'
                  )}
                >
                  {linkingProvider === provider.provider ? '연결 중...' : '연결'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 안내 문구 - mt-auto로 아래쪽에 붙이기 */}
      <div className="mt-auto pt-3 tablet:pt-4">
        <div className="p-2 tablet:p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
          <p className="text-[10px] tablet:text-xs text-neutral-500 dark:text-neutral-400">
            소셜 계정을 연결하면 해당 계정으로도 로그인할 수 있습니다.
            마지막 인증 수단은 해제할 수 없습니다.
          </p>
        </div>
      </div>

      {/* 비밀번호 확인 모달 */}
      {unlinkModal.isOpen && unlinkModal.provider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4">
              {PROVIDER_CONFIG[unlinkModal.provider].name} 연결 해제
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              계정 보안을 위해 비밀번호를 확인해주세요.
            </p>
            <form onSubmit={handleUnlinkModalSubmit}>
              <input
                type="password"
                value={unlinkModal.password}
                onChange={(e) => setUnlinkModal({ ...unlinkModal, password: e.target.value })}
                placeholder="비밀번호"
                className={cn(
                  'w-full px-4 py-2 rounded-lg border mb-4',
                  'border-neutral-300 dark:border-neutral-600',
                  'bg-white dark:bg-neutral-700',
                  'text-neutral-900 dark:text-neutral-50',
                  'focus:ring-2 focus:ring-primary-500 focus:border-transparent'
                )}
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setUnlinkModal({ isOpen: false, provider: null, password: '' })}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-lg',
                    'text-neutral-700 dark:text-neutral-300',
                    'hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  )}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!unlinkModal.password || unlinkingProvider === unlinkModal.provider}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-lg',
                    'bg-red-600 text-white hover:bg-red-700',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {unlinkingProvider === unlinkModal.provider ? '해제 중...' : '연결 해제'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
