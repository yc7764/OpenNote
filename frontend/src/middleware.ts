import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Security Middleware
 *
 * - 보호 라우트에 대한 서버측 1차 인증 가드(쿠키 존재 여부)
 * - connect-src를 클라이언트가 실제 호출하는 오리진과 일치, 하드코딩 도메인 제거
 * - CSP·보안 헤더로 XSS/clickjacking/MIME 스니핑 방어
 *
 * nonce 기반 script-src는 보류: Next.js 14.2.5가 standalone 런타임에서 자체 인라인
 * 부트스트랩 스크립트에 nonce를 부여하지 못해(브라우저 검증에서 6개 인라인 스크립트 차단 →
 * hydration 실패 확인) script-src는 'unsafe-inline'을 유지한다. React 이스케이프가 1차 방어.
 */

// 인증이 필요한 라우트 접두사 (그 외는 공개: /, /(auth)/*, /auth/callback/*, /about, /contact, /faq 등)
const PROTECTED_PREFIXES = ['/dashboard', '/create-note', '/notes', '/profile', '/contact/history'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProd = process.env.NODE_ENV === 'production';

  // 서버측 1차 인증 가드 — 보호 라우트인데 인증 쿠키가 전혀 없으면 로그인으로 보낸다.
  // 데이터는 쿠키 API로 이미 보호되므로 심층방어 성격이다. 쿠키가 있으나 만료/무효인 경우는
  // 통과시키고 클라이언트 AuthGuard + API(401)가 처리한다.
  if (isProtectedPath(pathname)) {
    const hasAuth =
      request.cookies.has('access_token') || request.cookies.has('refresh_token');
    if (!hasAuth) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/';
      loginUrl.search = '';
      return NextResponse.redirect(loginUrl);
    }
  }

  // script-src: 운영은 'unsafe-inline'(Next.js 하이드레이션 인라인 스크립트용), 개발은
  // hot reload용 'unsafe-eval' 추가. (nonce 전환은 위 주석 참고 — 보류)
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  // CSP connect-src를 클라이언트가 실제 호출하는 오리진과 일치시키고 하드코딩 도메인을 제거.
  // API_ORIGIN(런타임, 서버 전용)과 NEXT_PUBLIC_API_URL(빌드 타임, 클라이언트) 둘 다 허용한다.
  const apiOrigins = Array.from(
    new Set(
      [process.env.API_ORIGIN, process.env.NEXT_PUBLIC_API_URL]
        .filter((v): v is string => !!v)
        .map((u) => {
          try {
            return new URL(u).origin;
          } catch {
            return '';
          }
        })
        .filter(Boolean)
    )
  );
  // 소켓(sttEdit) origin을 ws(s)로 변환해 connect-src에 명시한다.
  // 운영은 게이트웨이 same-origin 프록시라 'self'로도 커버되지만(STT_EDIT_ORIGIN 불필요),
  // sttEdit이 별도 오리진/포트인 배포(예: dev의 localhost:21123)에서도 동작하도록 명시한다.
  // ⚠️ 미들웨어는 서버에서 실행되고 NEXT_PUBLIC_*는 빌드 시 placeholder로 구워지므로
  //   여기선 런타임 서버 전용 env(STT_EDIT_ORIGIN)를 읽는다(API_ORIGIN과 동일 패턴).
  // blanket `wss:`(전 호스트 허용)는 제거한다.
  const sttWsOrigins = Array.from(
    new Set(
      [process.env.STT_EDIT_ORIGIN]
        .filter((v): v is string => !!v)
        .map((u) => {
          try {
            const o = new URL(u).origin;
            return o.replace(/^http/, 'ws'); // http→ws, https→wss
          } catch {
            return '';
          }
        })
        .filter(Boolean)
    )
  );

  const cspDirectives = [
    "default-src 'self'",
    scriptSrc,
    // 스타일: Tailwind/styled-jsx 런타임 주입 때문에 unsafe-inline 유지
    "style-src 'self' 'unsafe-inline'",
    [
      "connect-src 'self'",
      ...sttWsOrigins,
      ...apiOrigins,
      // 소셜 로그인은 페이지 리다이렉트(navigation)라 connect-src 밖이지만,
      // 일부 프로바이더 SDK의 fetch 대비로 좁게 명시만 유지한다.
      'https://accounts.google.com',
      'https://github.com',
      'https://kauth.kakao.com',
      'https://nid.naver.com',
    ].filter(Boolean).join(' '),
    // 외부 이미지 미사용(아바타 없음, 소셜 로고는 로컬 /images/*) — blanket https: 제거
    "img-src 'self' data: blob:",
    "font-src 'self'",
    ["media-src 'self' blob:", ...apiOrigins].join(' '),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  const response = NextResponse.next();

  response.headers.set('Content-Security-Policy', cspDirectives);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // 구형 브라우저의 XSS Auditor를 명시적으로 비활성화 (현행 권고: OWASP)
  // 실제 XSS 방어는 React 이스케이프 + CSP가 담당.
  response.headers.set('X-XSS-Protection', '0');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(), payment=()'
  );
  if (isProd) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  return response;
}

// Apply middleware to all routes except static assets
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!api|_next/static|_next/image|favicon.ico|images|opennote_logo).*)',
  ],
};
