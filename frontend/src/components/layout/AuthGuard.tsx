"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, ready, loadMe } = useAuth();
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    // ready가 true가 될 때까지 대기 후 인증 체크
    if (!ready) return;

    let cancelled = false;

    // 이미 user가 있으면 통과.
    if (isAuthenticated) {
      setOk(true);
      return;
    }

    // AuthProvider는 루트 layout에 있어 네비게이션 시 리마운트되지 않으므로,
    // loadMe()가 초기 1회만 실행된 뒤 로그인하면 user가 stale(null)일 수 있다.
    // 즉시 '/'로 튕기면 '/' → checkAuthStatus 성공 → /dashboard → 무한 루프가 되므로,
    // 리다이렉트 전에 서버에 한 번 재검증(loadMe)하여 루프를 차단한다.
    loadMe().then((me) => {
      if (cancelled) return;
      if (me) {
        setOk(true);
      } else {
        setOk(false);
        router.push('/');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ready, isAuthenticated, loadMe, router]);

  // ready가 false이거나 ok가 null이면 로딩 스피너 표시
  if (!ready || ok === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner h-12 w-12" />
      </div>
    );
  }
  if (!ok) return null;
  return <>{children}</>;
}


