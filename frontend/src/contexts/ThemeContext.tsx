'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // 초기 테마 설정 (localStorage > 시스템 설정 > 기본값: light)
  useEffect(() => {
    setMounted(true);
    const storedTheme = localStorage.getItem('theme') as Theme | null;

    if (storedTheme) {
      // 사용자가 명시적으로 선택한 테마가 있으면 그것을 사용
      setThemeState(storedTheme);
      applyTheme(storedTheme, false); // 이미 저장되어 있으므로 다시 저장하지 않음
    } else {
      // 시스템 설정 확인
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const systemTheme: Theme = prefersDark ? 'dark' : 'light';

      setThemeState(systemTheme);
      applyTheme(systemTheme, false); // 시스템 설정이므로 저장하지 않음
    }
  }, []);

  // 테마 변경 시 localStorage 저장 및 클래스 적용
  const applyTheme = (newTheme: Theme, saveToStorage = true) => {
    const root = document.documentElement;
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    if (saveToStorage) {
      localStorage.setItem('theme', newTheme);
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  // 시스템 테마 변경 감지 (사용자가 명시적으로 선택하지 않은 경우에만)
  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // localStorage에 저장된 테마가 없을 때만 시스템 설정을 따름
      const storedTheme = localStorage.getItem('theme');
      if (!storedTheme) {
        const newTheme: Theme = e.matches ? 'dark' : 'light';
        setThemeState(newTheme);
        applyTheme(newTheme, false);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mounted]);

  // hydration 이슈 방지
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
