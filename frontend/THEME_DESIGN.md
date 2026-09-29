# OpenNote Dashboard - Dark/Light Mode Design System

## Overview
이 문서는 OpenNote 대시보드의 다크/라이트 모드 디자인 시스템을 정의합니다.

## Design Principles

### Visual Hierarchy
- **Light Mode**: 밝고 깨끗한 배경에 부드러운 그림자로 깊이감 표현
- **Dark Mode**: 어두운 배경에 경계선과 강조된 그림자로 구분, 눈의 피로 최소화

### Accessibility
- WCAG 2.1 AA 기준 준수 (최소 4.5:1 대비율)
- 다크 모드에서도 명확한 포커스 표시
- 색상에만 의존하지 않는 상태 표시

### Consistency
- 모든 컴포넌트에서 일관된 색상 토큰 사용
- 양 모드에서 동일한 시각적 위계 유지

---

## Color Palette

### Background Colors

#### Light Mode
```css
/* Page Background */
bg-gradient-to-br from-gradient-sky-light to-white
/* Alternative: bg-gradient-to-br from-blue-50 to-white */

/* Card/Surface Background */
bg-white

/* Elevated Surface */
bg-neutral-50

/* Hover Background */
hover:bg-neutral-50
```

#### Dark Mode
```css
/* Page Background */
dark:bg-gradient-to-br dark:from-neutral-900 dark:to-neutral-800

/* Card/Surface Background */
dark:bg-neutral-800

/* Elevated Surface */
dark:bg-neutral-700

/* Hover Background */
dark:hover:bg-neutral-700
```

### Text Colors

#### Light Mode
```css
/* Primary Text (Headings, Important Info) */
text-neutral-900

/* Secondary Text (Body, Descriptions) */
text-neutral-600

/* Tertiary Text (Metadata, Captions) */
text-neutral-500

/* Muted Text */
text-neutral-400
```

#### Dark Mode
```css
/* Primary Text */
dark:text-neutral-50

/* Secondary Text */
dark:text-neutral-300

/* Tertiary Text */
dark:text-neutral-400

/* Muted Text */
dark:text-neutral-500
```

### Border & Dividers

#### Light Mode
```css
/* Primary Border */
border-neutral-200

/* Subtle Border */
border-neutral-100

/* Divider */
divide-neutral-200
```

#### Dark Mode
```css
/* Primary Border */
dark:border-neutral-700

/* Subtle Border */
dark:border-neutral-600

/* Divider */
dark:divide-neutral-700
```

### Shadows

#### Light Mode
```css
/* Card Shadow */
shadow-lg

/* Hover Shadow */
hover:shadow-xl

/* Sidebar Shadow */
shadow-sidebar
```

#### Dark Mode
```css
/* Card Shadow (더 강조된 그림자 + 경계선) */
dark:shadow-2xl dark:shadow-black/50 dark:ring-1 dark:ring-neutral-700

/* Hover Shadow */
dark:hover:shadow-2xl dark:hover:shadow-black/70

/* Sidebar Shadow */
dark:shadow-2xl dark:shadow-black/40
```

### Interactive Elements

#### Buttons & Actions (Both Modes)
```css
/* Primary Button */
bg-primary-500 hover:bg-primary-600 text-white

/* Secondary Button */
bg-neutral-100 hover:bg-neutral-200 text-neutral-700
dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-neutral-100

/* Ghost Button */
hover:bg-neutral-100 text-neutral-700
dark:hover:bg-neutral-700 dark:text-neutral-300

/* Focus Ring */
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
dark:focus:ring-offset-neutral-800
```

### Status Colors (Both Modes)
```css
/* Success */
bg-green-500 dark:bg-green-600
text-green-700 dark:text-green-400

/* Warning */
bg-amber-500 dark:bg-amber-600
text-amber-700 dark:text-amber-400

/* Info */
bg-blue-500 dark:bg-blue-600
text-blue-700 dark:text-blue-400

/* Error */
bg-red-500 dark:bg-red-600
text-red-700 dark:text-red-400
```

---

## Component Design Guide

### 1. AppShell (Layout)

#### Current Issue
```tsx
// ❌ 하드코딩된 라이트 모드 색상
<div className="min-h-screen bg-gradient-to-br from-gradient-sky-light to-white">
```

#### Recommended Design
```tsx
// ✅ 다크 모드 지원
<div className="min-h-screen bg-gradient-to-br from-gradient-sky-light to-white dark:from-neutral-900 dark:to-neutral-800">
  {/* Sidebar */}
  <div className="bg-white dark:bg-neutral-800 shadow-sidebar dark:shadow-2xl dark:shadow-black/40">
    <Sidebar />
  </div>

  {/* Main Content */}
  <div className="lg:ml-64 min-h-screen">
    {children}
  </div>

  {/* Mobile Overlay */}
  <div className="bg-black/60 backdrop-blur-sm dark:bg-black/80" />
</div>
```

### 2. RecordingCard

#### Light Mode Design
- 화이트 배경, 부드러운 그림자
- 호버 시 그림자 강화 및 약간의 상승 효과
- 중립 색상 경계선

#### Dark Mode Design
- 다크 그레이 배경 (neutral-800)
- 강조된 그림자와 미세한 링 테두리
- 호버 시 배경 밝아짐 및 그림자 강화

#### Recommended Code
```tsx
<div
  className={cn(
    // Base styles
    'rounded-md p-7 cursor-pointer transition-all duration-200',
    'border group relative',

    // Light mode
    'bg-white border-neutral-100',
    'hover:shadow-lg hover:-translate-y-1',

    // Dark mode
    'dark:bg-neutral-800 dark:border-neutral-700',
    'dark:shadow-xl dark:shadow-black/50 dark:ring-1 dark:ring-neutral-700',
    'dark:hover:shadow-2xl dark:hover:shadow-black/70 dark:hover:bg-neutral-750',

    className
  )}
>
  {/* Title */}
  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
    {note.title}
  </h3>

  {/* Description */}
  <p className="text-sm text-neutral-600 dark:text-neutral-300">
    {note.preview}
  </p>

  {/* Metadata */}
  <div className="text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-700">
    <span>{formatDate(note.created_at)}</span>
  </div>

  {/* Hashtags */}
  <span className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
    {tag}
  </span>
</div>
```

### 3. Sidebar

#### Recommended Design
```tsx
<aside className={cn(
  'fixed top-0 left-0 h-full w-64 z-50',
  'bg-white dark:bg-neutral-800',
  'shadow-sidebar dark:shadow-2xl dark:shadow-black/40',
  'border-r border-neutral-100 dark:border-neutral-700',
  'transition-transform duration-300 ease-in-out'
)}>
  {/* Logo */}
  <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
    <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
      OpenNote
    </h1>
  </div>

  {/* Navigation */}
  <nav className="p-4 space-y-2">
    <a className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-lg',
      'text-neutral-700 dark:text-neutral-300',
      'hover:bg-neutral-100 dark:hover:bg-neutral-700',
      'transition-colors duration-200'
    )}>
      <Icon className="w-5 h-5" />
      <span>Menu Item</span>
    </a>
  </nav>
</aside>
```

### 4. DashboardHeader & Controls

#### FilterTabs
```tsx
<button className={cn(
  'px-4 py-2 rounded-lg font-medium transition-all',
  isActive
    ? 'bg-primary-500 text-white shadow-sm'
    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'
)}>
  {label}
</button>
```

#### SortDropdown
```tsx
<div className={cn(
  'absolute mt-2 rounded-lg shadow-lg',
  'bg-white dark:bg-neutral-800',
  'border border-neutral-200 dark:border-neutral-700',
  'ring-1 ring-black/5 dark:ring-white/10'
)}>
  <button className={cn(
    'w-full px-4 py-2 text-left transition-colors',
    'text-neutral-700 dark:text-neutral-300',
    'hover:bg-neutral-50 dark:hover:bg-neutral-700'
  )}>
    {option}
  </button>
</div>
```

### 5. Badge Component

```tsx
const variantStyles = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  default: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300',
}
```

### 6. Input & Form Elements

```tsx
<input className={cn(
  'w-full px-4 py-2 rounded-lg border transition-colors',
  'bg-white dark:bg-neutral-800',
  'border-neutral-300 dark:border-neutral-600',
  'text-neutral-900 dark:text-neutral-50',
  'placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
)} />
```

---

## Skeleton Loading States

### Light Mode
```tsx
<div className="bg-neutral-200 animate-pulse rounded" />
```

### Dark Mode
```tsx
<div className="bg-neutral-700 dark:bg-neutral-600 animate-pulse rounded" />
```

---

## Accessibility Guidelines

### Color Contrast Ratios
- **Light Mode**: 배경(white) 대비 텍스트(neutral-900) = 21:1 ✅
- **Dark Mode**: 배경(neutral-800) 대비 텍스트(neutral-50) = 15:1 ✅

### Focus Indicators
```css
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
dark:focus:ring-offset-neutral-800
```

### Interactive States
- 호버/포커스 상태는 양 모드에서 명확히 구분 가능해야 함
- 키보드 네비게이션 시 포커스 링이 항상 표시되어야 함

---

## Implementation Checklist

### Phase 1: Tailwind Config Update
- [ ] Tailwind config에 dark mode 색상 추가
- [ ] 커스텀 색상 토큰 정의 (필요시)
- [ ] 그림자 스타일 확장

### Phase 2: Core Layout Components
- [ ] AppShell - 배경 그라데이션 다크 모드 적용
- [ ] Sidebar - 배경, 텍스트, 네비게이션 아이템 스타일
- [ ] PageHeader - 검색바, 알림 아이콘 스타일

### Phase 3: Dashboard Components
- [ ] RecordingCard - Grid/List 뷰 모두 적용
- [ ] FilterTabs - 활성/비활성 상태 스타일
- [ ] SortDropdown - 드롭다운 메뉴 스타일
- [ ] ViewToggle - 토글 버튼 스타일

### Phase 4: UI Components
- [ ] Badge - 모든 variant 다크 모드 지원
- [ ] Button - Primary/Secondary/Ghost 버튼
- [ ] Input - 텍스트 입력, Select, Textarea
- [ ] Modal/Dialog - 오버레이 및 컨텐츠

### Phase 5: Testing & Validation
- [ ] 모든 페이지에서 다크/라이트 모드 전환 테스트
- [ ] 색상 대비율 검증 (WCAG AA)
- [ ] 키보드 네비게이션 및 포커스 표시 확인
- [ ] 모바일/태블릿 반응형 테스트

---

## Quick Reference: Common Patterns

### Background Pattern
```tsx
// Light → Dark
bg-white → dark:bg-neutral-800
bg-neutral-50 → dark:bg-neutral-700
bg-neutral-100 → dark:bg-neutral-600
```

### Text Pattern
```tsx
// Light → Dark
text-neutral-900 → dark:text-neutral-50
text-neutral-600 → dark:text-neutral-300
text-neutral-500 → dark:text-neutral-400
```

### Border Pattern
```tsx
// Light → Dark
border-neutral-200 → dark:border-neutral-700
border-neutral-100 → dark:border-neutral-600
```

### Shadow Pattern
```tsx
// Light → Dark
shadow-lg → dark:shadow-2xl dark:shadow-black/50
shadow-xl → dark:shadow-2xl dark:shadow-black/70
```

### Interactive Hover Pattern
```tsx
// Light → Dark
hover:bg-neutral-50 → dark:hover:bg-neutral-700
hover:bg-neutral-100 → dark:hover:bg-neutral-600
```

---

## Notes

- **Primary Color (Brand)**: `#2691d9` (primary-500)는 양 모드에서 동일하게 유지
- **Gradients**: 배경 그라데이션은 각 모드별로 별도 정의 필요
- **Transitions**: 모드 전환 시 부드러운 트랜지션 적용 (`transition-colors duration-200`)
- **Ring Borders**: 다크 모드에서 카드 경계를 명확히 하기 위해 `ring-1 ring-neutral-700` 사용

---

## Future Enhancements

- [ ] System preference 자동 감지 (matchMedia)
- [ ] 커스텀 테마 색상 설정 기능
- [ ] 고대비 모드 (High Contrast Mode) 지원
- [ ] 애니메이션 감소 모드 (Reduced Motion) 지원
