"use client";
import { useState, useEffect } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import AuthGuard from '@/components/layout/AuthGuard';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/layout/PageHeader';
import { createNote } from '@/services/notes';
import FileDropzone from '@/components/form/FileDropzone';
import KeywordInput from '@/components/form/KeywordInput';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import SuspenseWrapper from '@/components/providers/SuspenseWrapper';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { Input, Badge } from '@/components/ui';
import { useQuota } from '@/hooks/useQuota';
import { isQuotaError } from '@/types/quota';
import type { ApiError } from '@/lib/apiClient';

/**
 * 바이트를 사람이 읽기 쉬운 형식으로 변환
 */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

// 초안 키는 사용자별로 네임스페이스한다. 전역 키('create-note-draft')는
// 로그아웃 후에도 잔존해 다음 사용자 폼에 이전 사용자의 회의 제목·설명이 복원됐다.
const DRAFT_KEY_PREFIX = 'create-note-draft';
const draftKeyFor = (userId: number | string) => `${DRAFT_KEY_PREFIX}:${userId}`;

interface DraftData {
  title: string;
  description: string;
  keywords: string[];
  timestamp: number;
}

export default function CreateNotePage() {
  const router = useRouter();
  const { id: userId, ready } = useAuthContext();
  const { quota, refresh: refreshQuota } = useQuota();
  const [mode, setMode] = useState<'upload' | 'record'>('upload');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Load draft from localStorage on mount (사용자별 키)
  useEffect(() => {
    if (!ready || userId == null) return;
    try {
      const savedDraft = localStorage.getItem(draftKeyFor(userId));
      if (savedDraft) {
        const draft: DraftData = JSON.parse(savedDraft);
        // Only restore if saved within last 7 days
        const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - draft.timestamp < sevenDaysInMs) {
          setTitle(draft.title);
          setDescription(draft.description);
          setKeywords(draft.keywords || []);
          toast.info('임시 저장된 내용을 불러왔습니다.');
        } else {
          // Clear old draft
          localStorage.removeItem(draftKeyFor(userId));
        }
      }
    } catch {
      // 임시저장 로드 실패 - 무시
    }
  }, [ready, userId]);

  const handleSaveDraft = () => {
    if (!title && !description && keywords.length === 0) {
      toast.error('저장할 내용이 없습니다.');
      return;
    }

    try {
      const draft: DraftData = {
        title,
        description,
        keywords,
        timestamp: Date.now(),
      };
      if (userId == null) { toast.error('로그인이 필요합니다.'); return; }
      localStorage.setItem(draftKeyFor(userId), JSON.stringify(draft));
      toast.success('임시 저장되었습니다.');
    } catch {
      toast.error('임시 저장에 실패했습니다.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!audioFile) {
      toast.error('음원 파일을 선택해주세요.');
      return;
    }

    setIsUploading(true);

    try {
      await createNote(title || '제목 없음', audioFile, description, keywords);
      // Clear draft after successful creation
      if (userId != null) localStorage.removeItem(draftKeyFor(userId));
      // 쿼터 정보 백그라운드 갱신 (await 하지 않음)
      refreshQuota();
      toast.success('노트가 생성되었습니다.');
      // 리다이렉트 전에 로딩 상태 해제
      setIsUploading(false);
      router.push('/dashboard');
      return;
    } catch (error) {

      // 타입 안전한 쿼터 에러 처리
      if (isQuotaError(error)) {
        if (error.code === 'DAILY_LIMIT_EXCEEDED') {
          toast.error(`일일 노트 생성 제한에 도달했습니다. (${error.daily_used}/${error.daily_limit})`);
        } else if (error.code === 'STORAGE_LIMIT_EXCEEDED') {
          toast.error('저장 공간이 부족합니다. 기존 노트를 삭제해주세요.');
        }
        refreshQuota();
      } else {
        // 기타 API 에러 처리
        const apiError = error as ApiError;
        if (apiError.isServerError() && apiError.detail.includes('SlowDown')) {
          // MinIO/S3 과부하 에러
          toast.error('서버가 일시적으로 바쁩니다. 잠시 후 다시 시도해주세요.');
        } else {
          const errorMsg = apiError.detail || '노트 생성 중 오류가 발생했습니다.';
          toast.error(errorMsg);
        }
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SuspenseWrapper>
      <AuthGuard>
        <AppShell>
          {/* 업로드 중 오버레이 */}
          {isUploading && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white dark:bg-neutral-800 rounded-xl p-8 shadow-2xl flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-purple-200 dark:border-purple-900 border-t-purple-600 dark:border-t-purple-400 rounded-full animate-spin" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                    노트 생성 중...
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    파일을 업로드하고 있습니다
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="min-h-screen">
            <div className="max-w-5xl mx-auto px-6 py-6">
              {/* Header - 데스크톱에서만 표시 (모바일/태블릿은 MobileHeader 사용) */}
              <div className="hidden desktop:block">
                <PageHeader
                  title="새 노트 만들기"
                  showSearch={false}
                  showNotifications={false}
                  className="mb-4"
                />
              </div>

              {/* 쿼터 경고 배너 */}
              {quota && (quota.daily.remaining <= 3 || quota.storage.usage_percent >= 80) && (
                <div className={`rounded-lg p-4 mb-4 ${
                  quota.daily.remaining === 0 || quota.storage.usage_percent >= 95
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                    : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                }`}>
                  <div className="flex items-start gap-3">
                    <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      quota.daily.remaining === 0 || quota.storage.usage_percent >= 95
                        ? 'text-red-500'
                        : 'text-amber-500'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      {quota.daily.remaining === 0 && (
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">
                          오늘의 노트 생성 제한에 도달했습니다. 내일 다시 시도해주세요.
                        </p>
                      )}
                      {quota.daily.remaining > 0 && quota.daily.remaining <= 3 && (
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                          오늘 {quota.daily.remaining}개의 노트만 더 생성할 수 있습니다.
                        </p>
                      )}
                      {quota.storage.usage_percent >= 95 && (
                        <p className="text-sm font-medium text-red-700 dark:text-red-300 mt-1">
                          저장 공간이 거의 가득 찼습니다. ({quota.storage.used_display} / {quota.storage.limit_display})
                        </p>
                      )}
                      {quota.storage.usage_percent >= 80 && quota.storage.usage_percent < 95 && (
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mt-1">
                          저장 공간을 {quota.storage.usage_percent}% 사용 중입니다.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Upload / Record Buttons - 더 컴팩트하게 */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('upload')}
                    className={`
                      flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-medium transition-all text-sm
                      ${mode === 'upload'
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-2 border-blue-200 dark:border-blue-700'
                        : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-2 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                      }
                    `}
                    aria-label="오디오 파일 업로드"
                    aria-pressed={mode === 'upload'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                      />
                    </svg>
                    파일 업로드
                  </button>

                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-medium transition-all text-sm bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-2 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 relative"
                    aria-label="음성 녹음 (추가 예정)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                    음성 녹음
                    <span className="absolute -top-2 -right-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                      준비중
                    </span>
                  </button>
                </div>

                {/* File Upload Area - 높이 축소 */}
                {mode === 'upload' && (
                  <FileDropzone
                    selectedFile={audioFile}
                    onFileSelected={(file) => {
                      // 파일 선택 시 스토리지 쿼터 사전 확인
                      if (quota && file.size > quota.storage.remaining_bytes) {
                        toast.error(
                          `파일 크기(${formatBytes(file.size)})가 남은 저장 공간(${quota.storage.remaining_display})을 초과합니다.`
                        );
                        return;
                      }
                      setAudioFile(file);
                      // Auto-fill title from filename if empty
                      if (!title) {
                        const fileName = file.name.substring(0, file.name.lastIndexOf('.'));
                        setTitle(fileName);
                      }
                    }}
                    compact
                  />
                )}

                {/* Note Title Input */}
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    노트 제목
                  </label>
                  <input
                    type="text"
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 주간 팀 미팅"
                    className="w-full px-3 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all"
                  />
                </div>

                {/* Description Input (Optional) - rows 축소 */}
                <div>
                  <div className="mb-1.5">
                    <label htmlFor="description" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      설명 <span className="font-normal text-neutral-400 dark:text-neutral-500">(선택)</span>
                    </label>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      입력해 주시면 AI가 더 정확하게 요약할 수 있어요.
                    </p>
                  </div>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="주요 내용이나 회의 안건을 추가하세요..."
                    className="w-full px-3 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all resize-none"
                  />
                </div>

                {/* Keywords Input (Optional) */}
                <div>
                  <div className="mb-1.5">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      키워드 <span className="font-normal text-neutral-400 dark:text-neutral-500">(선택)</span>
                    </label>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      추가해 주시면 핵심 내용을 더 잘 파악할 수 있어요.
                    </p>
                  </div>
                  <KeywordInput
                    keywords={keywords}
                    onChange={setKeywords}
                    placeholder="예: 회의, 프로젝트, 일정"
                  />
                </div>

                {/* Action Buttons - 모바일에서 컴팩트하게 */}
                <div className="flex items-center justify-end gap-2 sm:gap-3 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveDraft}
                    className="text-xs sm:text-sm"
                  >
                    임시 저장
                  </Button>
                  <Button
                    type="submit"
                    variant="gradient"
                    size="sm"
                    disabled={!audioFile || isUploading || (quota?.daily.remaining === 0)}
                    loading={isUploading}
                    loadingText="생성 중..."
                    className="text-xs sm:text-sm"
                    leftIcon={
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    }
                  >
                    {quota?.daily.remaining === 0 ? '일일 제한 도달' : '노트 생성'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </AppShell>
      </AuthGuard>
    </SuspenseWrapper>
  );
}
