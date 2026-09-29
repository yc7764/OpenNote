'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/components/common/ThemeToggle';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { useAuth } from '@/hooks/useAuth';
import { submitContact, fetchContactStatus } from '@/services/support';
import { ApiError } from '@/lib/apiClient';
import type { ContactStatus } from '@/types/support';

export default function ContactPage() {
  const router = useRouter();
  const { user, ready, isAuthenticated, ensureAuth } = useAuth();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ subject?: string; message?: string }>({});
  const [contactStatus, setContactStatus] = useState<ContactStatus | null>(null);

  // 인증 확인
  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.push('/');
    }
  }, [ready, isAuthenticated, router]);

  // 문의 가능 상태 로드
  useEffect(() => {
    const loadStatus = async () => {
      if (!isAuthenticated) return;
      try {
        const status = await fetchContactStatus();
        setContactStatus(status);
      } catch (err) {
        // Error silently handled
      }
    };

    if (ready && isAuthenticated) {
      loadStatus();
    }
  }, [ready, isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 클라이언트 측 유효성 검사
    const errors: { subject?: string; message?: string } = {};
    if (!subject.trim()) {
      errors.subject = '제목을 입력해주세요.';
    } else if (subject.trim().length < 2) {
      errors.subject = '제목은 2자 이상 입력해주세요.';
    }
    if (!message.trim()) {
      errors.message = '문의 내용을 입력해주세요.';
    } else if (message.trim().length < 10) {
      errors.message = '문의 내용은 10자 이상 입력해주세요.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await submitContact({ subject: subject.trim(), message: message.trim() });
      setSuccess(true);
      setSubject('');
      setMessage('');
      // 남은 횟수 업데이트
      if (contactStatus) {
        setContactStatus({
          ...contactStatus,
          remaining: response.remaining,
          today_count: contactStatus.today_count + 1,
          can_submit: response.remaining > 0
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors.subject) {
          setFieldErrors((prev) => ({ ...prev, subject: err.fieldErrors.subject[0] }));
        }
        if (err.fieldErrors.message) {
          setFieldErrors((prev) => ({ ...prev, message: err.fieldErrors.message[0] }));
        }
        if (err.detail) {
          setError(err.detail);
        } else if (Object.keys(err.fieldErrors).length === 0) {
          setError('문의 전송에 실패했습니다. 다시 시도해주세요.');
        }
      } else {
        setError('문의 전송에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 로딩 중이거나 인증되지 않은 경우
  if (!ready || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // 사용자 이름 (full_name 또는 username)
  const userName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`.trim()
    : user?.first_name || user?.last_name || user?.username || '';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">돌아가기</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            문의하기
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            서비스 이용 중 궁금한 점이나 불편한 점을 알려주세요
          </p>
          {/* 남은 문의 횟수 표시 */}
          {contactStatus && (
            <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${
              contactStatus.can_submit
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {contactStatus.can_submit
                ? `오늘 남은 문의 횟수: ${contactStatus.remaining}/${contactStatus.limit}회`
                : `오늘 문의 횟수(${contactStatus.limit}회)를 모두 사용했습니다`
              }
            </div>
          )}
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-green-800 dark:text-green-200 font-medium">문의가 정상적으로 접수되었습니다.</p>
                <p className="text-green-600 dark:text-green-400 text-sm mt-1">빠른 시일 내에 답변 드리겠습니다.</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Contact Form */}
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* User Info (Read-only) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  이름
                </label>
                <input
                  type="text"
                  value={userName}
                  disabled
                  className="w-full px-3 py-2.5 text-base bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-md text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  이메일
                </label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-3 py-2.5 text-base bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-md text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Subject */}
            <Input
              label="제목"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="문의 제목을 입력해주세요"
              error={fieldErrors.subject}
              variant="outlined"
              fullWidth
              disabled={loading || (contactStatus !== null && !contactStatus.can_submit)}
            />

            {/* Message */}
            <Textarea
              label="문의 내용"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="문의하실 내용을 자세히 작성해주세요"
              error={fieldErrors.message}
              variant="outlined"
              fullWidth
              rows={6}
              showCharCount
              maxLength={2000}
              disabled={loading || (contactStatus !== null && !contactStatus.can_submit)}
            />

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading || (contactStatus !== null && !contactStatus.can_submit)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-md transition-colors disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    전송 중...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    문의 보내기
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* My Inquiry History CTA */}
        <div className="mt-8 flex items-center justify-between py-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            이전에 보낸 문의 내용을 확인하시겠어요?
          </p>
          <Link
            href="/contact/history"
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            내 문의 내역 &rarr;
          </Link>
        </div>

        {/* FAQ CTA */}
        <div className="flex items-center justify-between py-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            문의 전 자주 묻는 질문을 확인해보세요
          </p>
          <Link
            href="/faq"
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            FAQ 보기 &rarr;
          </Link>
        </div>

        {/* Footer Links */}
        <div className="flex flex-col items-center gap-3 mt-8 text-sm">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <Link href="/terms" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              이용약관
            </Link>
            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">•</span>
            <Link href="/privacy" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              개인정보처리방침
            </Link>
            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">•</span>
            <Link href="/about" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              서비스 소개
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
