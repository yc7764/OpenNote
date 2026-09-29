'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/components/common/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { fetchContactHistory } from '@/services/support';
import type { ContactInquiry } from '@/types/support';

// 문의 항목 컴포넌트
function InquiryItem({ inquiry, isOpen, onToggle }: { inquiry: ContactInquiry; isOpen: boolean; onToggle: () => void }) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 상태 결정: 답변완료 > 확인됨 > 대기중
  const getStatus = () => {
    if (inquiry.has_reply) {
      return { label: '답변완료', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
    }
    if (inquiry.is_read) {
      return { label: '확인됨', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
    }
    return { label: '대기중', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' };
  };

  const status = getStatus();

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors px-1"
      >
        <div className="flex-1 pr-4">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDate(inquiry.created_at)}
            </span>
          </div>
          <span className="text-gray-900 dark:text-white font-medium">{inquiry.subject}</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {/* 내 문의 내용 */}
        <div className="pb-3 pt-3 px-3 mb-2 bg-gray-100 dark:bg-gray-700/50 rounded-md">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-indigo-500 dark:text-indigo-400 font-semibold text-xs">내 문의</span>
          </div>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {inquiry.message}
          </p>
        </div>

        {/* 관리자 답변 */}
        {inquiry.has_reply && inquiry.admin_reply && (
          <div className="pb-4 pt-3 px-3 mb-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">관리자 답변</span>
              {inquiry.replied_at && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(inquiry.replied_at)}
                </span>
              )}
            </div>
            <p className="text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
              {inquiry.admin_reply}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContactHistoryPage() {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  const [inquiries, setInquiries] = useState<ContactInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  // 인증 확인
  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.push('/');
    }
  }, [ready, isAuthenticated, router]);

  // 문의 이력 로드
  useEffect(() => {
    const loadHistory = async () => {
      if (!isAuthenticated) return;

      try {
        const data = await fetchContactHistory();
        setInquiries(data);
      } catch (err) {
        setError('문의 이력을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    if (ready && isAuthenticated) {
      loadHistory();
    }
  }, [ready, isAuthenticated]);

  const toggleItem = (id: number) => {
    setOpenItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 로딩 중이거나 인증되지 않은 경우
  if (!ready || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

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
            내 문의 내역
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            이전에 보낸 문의 내용을 확인할 수 있습니다
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Inquiry List */}
        {!loading && !error && (
          <div>
            {inquiries.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  아직 문의 내역이 없습니다.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  새 문의하기
                </Link>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 px-4">
                {inquiries.map((inquiry) => (
                  <InquiryItem
                    key={inquiry.id}
                    inquiry={inquiry}
                    isOpen={openItems.has(inquiry.id)}
                    onToggle={() => toggleItem(inquiry.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* New Inquiry CTA */}
        {!loading && !error && inquiries.length > 0 && (
          <div className="mt-8 flex items-center justify-between py-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              추가 문의가 필요하신가요?
            </p>
            <Link
              href="/contact"
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              새 문의하기 &rarr;
            </Link>
          </div>
        )}

        {/* Footer Links */}
        <div className="flex flex-col items-center gap-3 mt-8 text-sm">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <Link href="/faq" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              FAQ
            </Link>
            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">•</span>
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
