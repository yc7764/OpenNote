# OpenNote V2 Frontend

Next.js 14 (App Router) + React 18 + TypeScript 기반 프론트엔드 애플리케이션.

## 빠른 시작

```bash
npm ci        # 의존성 설치
npm run dev   # 개발 서버 (http://localhost:3000)
npm run build # 프로덕션 빌드
```

### 환경변수 (`.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000           # Django API
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000       # 프론트엔드
NEXT_PUBLIC_STT_EDIT_MODULE_URL=http://localhost:21123  # sttEdit WebSocket
API_ORIGIN=http://localhost:8000                     # Server-only (middleware CSP)
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| 스타일 | Tailwind CSS 3, CSS Modules |
| 상태/데이터 | SWR, Context API |
| 실시간 | Socket.IO Client |
| UI | Heroicons, Plyr.js (오디오), Tippy.js (툴팁), Sonner (토스트) |
| 유틸 | clsx, tailwind-merge |

## 디렉토리 구조

```
src/
├── app/                              # App Router 페이지/레이아웃
│   ├── layout.tsx                    # 루트 레이아웃 (AppShell)
│   ├── page.tsx                      # 로그인 페이지
│   ├── globals.css                   # 전역 스타일 (Tailwind, 접근성)
│   ├── error.tsx                     # 에러 바운더리
│   ├── (auth)/                       # 인증 라우트 그룹
│   │   ├── login/
│   │   ├── signup/
│   │   ├── email-verification/
│   │   ├── email-change/
│   │   ├── password-reset/
│   │   └── reset-password/
│   ├── auth/                         # OAuth 콜백
│   ├── dashboard/                    # 노트 목록 (메인)
│   ├── create-note/                  # 노트 생성 (오디오 업로드)
│   ├── notes/[id]/                   # 노트 상세 (STT + 요약 + 오디오)
│   ├── profile/                      # 프로필 관리
│   ├── about/                        # 서비스 소개
│   ├── contact/                      # 문의하기
│   │   └── history/                  # 문의 이력
│   ├── faq/                          # FAQ
│   ├── privacy/                      # 개인정보 처리방침
│   └── terms/                        # 이용약관
│
├── components/
│   ├── layout/                       # 레이아웃 컴포넌트
│   │   ├── AppShell.tsx              # 메인 레이아웃 (사이드바 포함)
│   │   ├── AuthGuard.tsx             # 인증 보호 래퍼
│   │   └── Sidebar.tsx               # 사이드바 네비게이션
│   ├── dashboard/                    # 대시보드 컴포넌트
│   │   ├── DashboardHeader.tsx       # 검색/필터 헤더
│   │   ├── FilterTabs.tsx            # 필터 탭 (전체/즐겨찾기/휴지통)
│   │   ├── QuotaDisplay.tsx          # 사용량 표시
│   │   ├── RecordingCard.tsx         # 노트 카드
│   │   ├── SelectionBar.tsx          # 선택 모드 바
│   │   ├── SortDropdown.tsx          # 정렬 드롭다운
│   │   ├── TrashCard.tsx             # 휴지통 카드
│   │   ├── UserProfile.tsx           # 사용자 프로필
│   │   └── ViewToggle.tsx            # 뷰 전환 (그리드/리스트)
│   ├── notes/                        # 노트 상세 컴포넌트
│   │   ├── NoteDetailLayout.tsx      # 전체 레이아웃
│   │   ├── NoteHeader.tsx            # 제목/상태/날짜/액션
│   │   ├── STTResults.tsx            # STT 결과 컨테이너
│   │   ├── NoteSegment.tsx           # 개별 세그먼트 (화자별 색상)
│   │   ├── NoteSummary.tsx           # AI 요약 섹션
│   │   ├── NoteList.tsx              # 노트 목록
│   │   └── StatusBadge.tsx           # 처리 상태 배지
│   ├── audio/                        # 오디오 플레이어
│   │   └── AudioPlayer.tsx           # Plyr.js 기반 커스텀 플레이어
│   ├── notifications/                # 알림 시스템
│   │   ├── NotificationBell.tsx      # 알림 벨 아이콘 (읽지않은 수)
│   │   └── NotificationDropdown.tsx  # 알림 드롭다운
│   ├── onboarding/                   # 온보딩/가이드
│   │   ├── WelcomeModal.tsx          # 환영 모달
│   │   ├── GuidedTour.tsx            # 가이드 투어
│   │   ├── HelpButton.tsx            # 도움말 버튼
│   │   ├── HelpPanel.tsx             # 도움말 패널
│   │   └── GuideHint.tsx             # 가이드 힌트
│   ├── profile/                      # 프로필 컴포넌트
│   │   └── LinkedAccountsSection.tsx # 소셜 계정 연동 관리
│   ├── auth/                         # 인증 컴포넌트
│   │   └── OAuthCallbackLayout.tsx   # OAuth 콜백 레이아웃
│   ├── form/                         # 폼 컴포넌트
│   │   └── FileDropzone.tsx          # 파일 업로드 (확장자/사이즈 검증)
│   ├── common/                       # 공통 UI
│   │   ├── Accordion.tsx, Button.tsx, Card.tsx
│   │   ├── ErrorAlert.tsx, ErrorBanner.tsx
│   │   ├── Loader.tsx, Modal.tsx
│   │   ├── PanelResizer.tsx          # 드래그 가능한 패널 분할선
│   │   ├── Table.tsx, Tabs.tsx
│   │   └── ...
│   ├── icons/                        # 커스텀 아이콘
│   ├── providers/                    # Provider 컴포넌트
│   └── ui/                           # Shadcn UI 컴포넌트
│
├── hooks/
│   ├── useAuth.ts                    # 인증 (로그인/로그아웃/소셜 콜백)
│   ├── useAudioPlayer.ts            # 오디오 플레이어 제어
│   ├── useNoteSocket.ts             # 실시간 편집 Socket.IO
│   ├── useNoteSelection.ts          # 노트 선택/일괄 처리
│   ├── useEditableField.ts          # 인라인 편집
│   ├── useClickHandler.ts           # 클릭 핸들러
│   ├── useClickOutside.ts           # 외부 클릭 감지
│   ├── useMediaQuery.ts             # 반응형 미디어 쿼리
│   ├── usePullToRefresh.ts          # 풀 투 리프레시 (모바일)
│   ├── useQuota.ts                  # 사용량 쿼터
│   ├── useSwipeGesture.ts           # 스와이프 제스처
│   ├── useSwipeToDelete.ts          # 스와이프 삭제
│   └── socket/                      # Socket.IO 유틸리티
│       ├── rateLimiter.ts           # 클라이언트 Rate Limiting
│       ├── reconnectLogic.ts        # 재연결 로직
│       ├── socketEventHandlers.ts   # 이벤트 핸들러
│       └── updateValidators.ts      # 데이터 검증
│
├── contexts/
│   ├── AuthContext.tsx               # 인증 상태 관리
│   ├── NotificationContext.tsx       # 알림 상태 관리
│   └── ThemeContext.tsx              # 테마 (라이트/다크)
│
├── services/                         # API 호출 래퍼
│   ├── auth.ts                      # 인증 API
│   ├── notes.ts                     # 노트 API
│   ├── profile.ts                   # 프로필 API
│   ├── notifications.ts             # 알림 API
│   └── support.ts                   # 고객지원 API
│
├── lib/                              # 저수준 유틸리티
│   ├── apiClient.ts                 # HTTP 클라이언트 (인증 헤더 자동 주입)
│   ├── config.ts                    # 환경변수 설정
│   ├── format.ts                    # 포맷터 (에러 메시지 표준화)
│   ├── storage.ts                   # 로컬스토리지 (토큰 관리)
│   └── utils.ts                     # Tailwind cn() 유틸
│
├── constants/                        # 상수
│   ├── speakers.ts                  # 화자 색상 (16가지)
│   └── timeouts.ts                  # 타임아웃 값
│
├── providers/
│   └── QueryProvider.tsx            # SWR 전역 설정
│
├── types/                            # TypeScript 타입 정의
│   ├── auth.ts                      # 인증 타입
│   └── note.ts                      # 노트/세그먼트/요약 타입
│
└── middleware.ts                     # Next.js 미들웨어 (CSP 등)
```

## 라우팅 맵

| 경로 | 페이지 | 인증 |
|------|--------|------|
| `/` | 로그인 | 불필요 |
| `/dashboard` | 노트 목록 (메인) | 필요 |
| `/create-note` | 노트 생성 (업로드) | 필요 |
| `/notes/[id]` | 노트 상세 | 필요 |
| `/profile` | 프로필 관리 | 필요 |
| `/about` | 서비스 소개 | 불필요 |
| `/faq` | FAQ | 불필요 |
| `/contact` | 문의하기 | 필요 |
| `/contact/history` | 문의 이력 | 필요 |
| `/privacy` | 개인정보 처리방침 | 불필요 |
| `/terms` | 이용약관 | 불필요 |
| `/(auth)/signup` | 회원가입 | 불필요 |
| `/(auth)/email-verification` | 이메일 인증 | 불필요 |
| `/(auth)/email-change` | 이메일 변경 결과 | 불필요 |
| `/(auth)/password-reset` | 비밀번호 재설정 요청 | 불필요 |
| `/(auth)/reset-password` | 비밀번호 재설정 확인 | 불필요 |

## 핵심 흐름

### 1. 인증

```
useAuth.ts → apiClient.ts (헤더 주입) → AuthGuard.tsx (보호 라우팅)
```

- 토큰 저장: `lib/storage.ts` (`TOKEN_KEYS.access/refresh`)
- 401 응답 → `apiClient`가 토큰 제거 → `AuthGuard`가 로그인 페이지로 리다이렉트
- 소셜 로그인: OAuth 콜백 → `useAuth.ts` 토큰 소비

### 2. 데이터 패칭 (SWR)

```
QueryProvider.tsx (전역 SWR 설정) → services/* (API 함수) → types/* (타입 정의)
```

- `shouldRetryOnError=false`, `revalidateOnFocus=false`

### 3. 노트 상세 페이지

```
NoteDetailLayout
├── NoteHeader (제목/상태/날짜/삭제)
├── STTResults → NoteSegment[] (화자별 색상, 좌우 정렬)
├── PanelResizer (드래그 분할선)
├── NoteSummary (주제/키워드/다음 행동/섹션별 요약)
└── AudioPlayer (하단 고정, 세그먼트 클릭 → 시간 이동)
```

### 4. 실시간 편집 (Socket.IO → sttEdit)

```
useNoteSocket.ts → Socket.IO → sttEdit (NestJS WebSocket)
socket/rateLimiter.ts      # 클라이언트 Rate Limiting
socket/reconnectLogic.ts   # 재연결 로직
socket/socketEventHandlers.ts  # 이벤트 핸들러
socket/updateValidators.ts     # 데이터 검증
```

### 5. 알림

```
NotificationContext.tsx → NotificationBell.tsx → NotificationDropdown.tsx
services/notifications.ts → /api/notifications/*
```

### 6. 온보딩

```
OnboardingContext.tsx → WelcomeModal → GuidedTour → GuideHint/HelpButton/HelpPanel
```

## 스타일 구조

### 전역 스타일 (`globals.css`)
- Tailwind 디렉티브 (`@tailwind base/components/utilities`)
- 접근성 유틸리티 (`.sr-only`, `.touch-target`, `.focus-visible-ring`)
- 고대비 모드, 움직임 축소 미디어 쿼리
- 서드파티 CSS (Plyr.js, Tippy.js)

### CSS Modules (컴포넌트별)
각 컴포넌트는 독립된 `.module.css`로 스타일 캡슐화:
- `NoteSegment.module.css` — 16가지 화자 색상 (`.speaker-0` ~ `.speaker-15`)
- `AudioPlayer.module.css` — Plyr 커스터마이징
- `PanelResizer.module.css` — 드래그 분할선

### 디자인 원칙
- **Tailwind-first**: 간단한 스타일은 유틸리티 클래스
- **CSS Modules**: 복잡한 컴포넌트별 스타일
- **접근성 우선**: WCAG 준수, 터치 타겟(44x44px), 스크린 리더 지원
- **반응형**: 모바일 우선, 스와이프/풀 투 리프레시 등 모바일 UX

## 컴포넌트 설계 원칙

1. **단일 책임**: 각 컴포넌트는 하나의 명확한 역할
2. **Props 기반**: 외부 상태는 props로 주입
3. **CSS Module**: 스타일 캡슐화
4. **타입 안전성**: 모든 props에 TypeScript 타입 정의
5. **접근성**: ARIA 라벨, 키보드 네비게이션, 시맨틱 HTML
6. **재사용성**: 공통(`common/`) / 도메인별(`notes/`, `dashboard/`) 분리

## 개발 가이드

### 경로 별칭
`@/*` (tsconfig `paths`) 사용: `import { apiClient } from '@/lib/apiClient'`

### 데이터 접근 규칙
페이지/컴포넌트는 반드시 `services/*`를 통해 API 호출. 직접 `fetch` 지양.

### 새 페이지 추가 체크리스트
1. `src/app`에 파일 생성
2. 인증 필요 시 `AuthGuard`로 보호
3. 로딩/에러 UX: `Loader`/`ErrorBanner`/`sonner` 토스트로 일관되게 처리

### 새 API 추가 체크리스트
1. `src/services/*`에 함수 추가
2. 타입은 `src/types/*`에 정의
3. `apiClient` 경유 (인증 헤더 자동 주입)

### 변경 시 주의사항
- 오디오 관련: `AudioPlayer.tsx`와 `app/notes/[id]/page.tsx`가 결합 → 함께 검토
- 실시간 편집: `useNoteSocket.ts`와 `socket/` 하위 모듈 함께 검토
- `useSearchParams` 사용 페이지는 `Suspense`로 래핑 필요
- 테마: `ThemeContext.tsx`를 통해 라이트/다크 모드 관리
