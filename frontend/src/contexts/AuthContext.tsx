"use client";
import { createContext, useContext, useCallback, useEffect, useState, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { fetchMe } from '@/services/auth';
import { apiClient } from '@/lib/apiClient';
import type { User } from '@/types/auth';

export type { User };

interface AuthContextType {
  user: User | null;
  id: number | undefined;
  username: string | undefined;
  ready: boolean;
  isAuthenticated: boolean;
  ensureAuth: () => boolean;
  loadMe: () => Promise<User | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const inFlightRef = useRef<Promise<User | null> | null>(null);
  const initializedRef = useRef(false);

  // 인증 상태는 user 객체 유무로 판단 (쿠키는 JavaScript에서 접근 불가)
  const isAuthenticated = !!user;

  // 사용자 정보 로드 함수
  // 이미 진행 중이면 즉시 null을 반환하던 기존 dedup은, OAuth 콜백의
  // await loadMe()가 초기 마운트 로드와 겹칠 때 no-op(null)이 되어 user 미갱신
  // 상태로 이동하는 잠재 버그가 있었다. in-flight Promise를 반환해 두 번째 호출자도
  // 동일한 실제 결과를 받게 한다.
  const loadMe = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;

    const promise = (async (): Promise<User | null> => {
      try {
        const me = await fetchMe();
        setUser(me);
        return me;
      } catch {
        setUser(null);
        return null;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, []);

  // 초기 마운트 1회만 실행 — pathname 변경마다 반복 호출 방지
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    loadMe().finally(() => setReady(true));
  }, [loadMe]);

  const ensureAuth = useCallback(() => {
    if (!isAuthenticated) {
      router.push('/');
      return false;
    }
    return true;
  }, [isAuthenticated, router]);

  // 로그아웃 - 서버에서 쿠키 제거 + 클라이언트 상태 전체 초기화
  const logout = useCallback(async () => {
    try {
      // 서버에 로그아웃 요청 (쿠키 제거)
      await apiClient('/api/auth/logout/', {
        method: 'POST',
      });
    } catch {
      // 로그아웃 실패해도 클라이언트 상태는 초기화
    }
    setUser(null);
    // 레거시 localStorage 토큰 정리 (현재는 HttpOnly 쿠키 사용, 호환성 위해 유지)
    // + 노트 작성 초안(사용자별 키 포함)을 모두 제거해 다음 사용자에게 잔존하지 않게 한다.
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('create-note-draft')) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // Private browsing 등 localStorage 접근 실패 무시
    }
    // 하드 내비게이션으로 전환한다. 소프트 push는 SWR 전역 인메모리 캐시(노트 목록·
    // 프로필·이메일 등)를 비우지 않아, 같은 브라우저에서 다음 사용자가 로그인하면
    // 이전 사용자 데이터가 잠시 렌더된다. 계정 삭제·401 경로와 동일하게
    // window.location으로 전체 상태(SWR 캐시·React 상태)를 초기화한다.
    window.location.href = '/';
  }, []);

  const value: AuthContextType = {
    user,
    id: user?.pk,
    username: user?.username,
    ready,
    isAuthenticated,
    ensureAuth,
    loadMe,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
