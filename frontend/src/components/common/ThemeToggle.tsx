'use client';

import { useState, useEffect } from 'react';
import { SunIcon, MoonIcon } from '@heroicons/react/24/solid';

// ThemeProvider 없이도 동작하는 독립적인 ThemeToggle
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // localStorage에서 테마 읽기
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (storedTheme) {
      setTheme(storedTheme);
    } else {
      // 시스템 설정 확인
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);

    // DOM에 dark 클래스 토글
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // hydration 이슈 방지 - 마운트 전에는 렌더링하지 않음
  if (!mounted) {
    return (
      <div className="relative inline-flex items-center gap-2 p-1 rounded-full bg-neutral-200 dark:bg-neutral-700 w-[88px] h-[40px]" />
    );
  }
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex items-center gap-2 p-1 rounded-full bg-neutral-200 dark:bg-neutral-700 transition-colors duration-300"
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
    >
      {/* Sun Icon (Light Mode) */}
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
          !isDark
            ? 'bg-white shadow-md text-amber-500'
            : 'text-neutral-400'
        }`}
      >
        <SunIcon className="w-5 h-5" />
      </div>

      {/* Moon Icon (Dark Mode) */}
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
          isDark
            ? 'bg-neutral-800 shadow-md text-blue-400'
            : 'text-neutral-400'
        }`}
      >
        <MoonIcon className="w-5 h-5" />
      </div>
    </button>
  );
}
