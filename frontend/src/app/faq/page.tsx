'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/components/common/ThemeToggle';
import { fetchFAQs } from '@/services/support';
import type { FAQ, FAQByCategory } from '@/types/support';

// 아코디언 아이템 컴포넌트
function AccordionItem({ faq, isOpen, onToggle }: { faq: FAQ; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors px-1"
      >
        <div className="flex items-start gap-3 pr-4">
          <span className="text-indigo-500 dark:text-indigo-400 font-semibold text-sm mt-0.5">Q</span>
          <span className="text-gray-900 dark:text-white font-medium">{faq.question}</span>
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
          isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="pb-4 pt-3 px-3 mb-2 bg-gray-100 dark:bg-gray-700/50 rounded-md flex items-start gap-3">
          <span className="text-gray-400 dark:text-gray-500 font-semibold text-sm mt-0.5">A</span>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {faq.answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FAQPage() {
  const router = useRouter();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    const loadFAQs = async () => {
      try {
        const data = await fetchFAQs();
        setFaqs(data);
      } catch (err) {
        setError('FAQ를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadFAQs();
  }, []);

  // FAQ를 카테고리별로 그룹화
  const faqsByCategory: FAQByCategory = faqs.reduce((acc, faq) => {
    const category = faq.category_display;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(faq);
    return acc;
  }, {} as FAQByCategory);

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
            자주 묻는 질문
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            OpenNote 서비스 이용에 대한 궁금증을 해결해 드립니다
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

        {/* FAQ Content */}
        {!loading && !error && (
          <div className="space-y-8">
            {Object.keys(faqsByCategory).length === 0 ? (
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
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-gray-500 dark:text-gray-400">
                  아직 등록된 FAQ가 없습니다.
                </p>
              </div>
            ) : (
              Object.entries(faqsByCategory).map(([category, categoryFaqs]) => (
                <section key={category}>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-5 bg-indigo-500 rounded-full"></span>
                    {category}
                  </h2>
                  <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 px-4">
                    {categoryFaqs.map((faq) => (
                      <AccordionItem
                        key={faq.id}
                        faq={faq}
                        isOpen={openItems.has(faq.id)}
                        onToggle={() => toggleItem(faq.id)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}

        {/* Contact CTA */}
        <div className="mt-10 flex items-center justify-between py-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            원하시는 답변을 찾지 못하셨나요?
          </p>
          <Link
            href="/contact"
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            문의하기 &rarr;
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
