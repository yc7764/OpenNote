'use client';

import React from 'react';
import type { DemoAnimationType } from './tourSteps';

interface TourDemoAnimationProps {
  type: DemoAnimationType;
}

/** 커서 SVG 아이콘 */
function CursorIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path
        fill="currentColor"
        d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z"
      />
    </svg>
  );
}

/**
 * 더블클릭 데모 — 세그먼트 카드 + 텍스트 편집 전환
 * 사용: stt-edit, summary-actions, summary-main-topic, speaker-name-edit
 */
function DoubleClickDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
      {/* 세그먼트 헤더 (화자 + 시간) */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">화자 1</span>
        <span className="text-[9px] text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-700 rounded px-1.5 py-0.5">
          0:12
        </span>
      </div>

      {/* 텍스트 영역 — 비편집 → 편집 상태 전환 애니메이션 */}
      <div className="relative px-3 pb-2">
        {/* 비편집 상태 텍스트 (사라짐) */}
        <div className="text-[11px] text-neutral-700 dark:text-neutral-200 leading-relaxed animate-tour-demo-text-fade">
          오늘 회의에서 논의할 주요 안건을 정리해 보겠습니다.
        </div>
        {/* 편집 상태 (나타남) — blue ring textarea */}
        <div
          className="absolute inset-x-3 top-0 text-[11px] text-neutral-700 dark:text-neutral-200 leading-relaxed
                     bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1.5
                     ring-2 ring-blue-500 dark:ring-blue-400 animate-tour-demo-edit-appear"
        >
          오늘 회의에서 논의할 주요 안건을 정리해 보겠습니다.
          <span className="inline-block w-[1px] h-3 bg-blue-500 dark:bg-blue-400 ml-px animate-pulse align-text-bottom" />
        </div>
      </div>

      {/* 커서 — 텍스트 영역 중앙으로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '80px', '--cursor-y': '36px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-cursor-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 클릭 데모 — 세그먼트 헤더의 화자 클릭 + 드롭다운
 * 사용: stt-speaker-change
 */
function ClickDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
      {/* 세그먼트 상단: 화자 + 시간 */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
          화자 1
          <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
        <span className="text-[9px] text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-700 rounded px-1.5 py-0.5">
          1:05
        </span>
      </div>

      {/* 텍스트 */}
      <div className="px-3 pb-1">
        <span className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
          다음 분기 목표에 대해 의견을 나눠봅시다.
        </span>
      </div>

      {/* 드롭다운 (화자 선택) */}
      <div
        className="absolute left-3 top-[38px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600
                   rounded-lg shadow-lg overflow-hidden min-w-[100px] z-10"
        style={{ animation: 'tour-expand 3.5s ease-in-out infinite', '--expand-h': '44px' } as React.CSSProperties}
      >
        <div className="px-2.5 py-1.5 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-neutral-700 dark:text-neutral-300 font-medium">화자 1 ✓</span>
        </div>
        <div className="px-2.5 py-1.5 flex items-center gap-2 hover:bg-neutral-50">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-[10px] text-neutral-700 dark:text-neutral-300">화자 2</span>
        </div>
      </div>

      {/* 커서 — 화자 이름 위치로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '24px', '--cursor-y': '14px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-single-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 텍스트 클릭 데모 — 세그먼트 텍스트 클릭 → 재생 하이라이트
 * 사용: audio-timestamp
 */
function ClickTextDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
      {/* 세그먼트 헤더 */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">화자 1</span>
        <span className="text-[9px] text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-700 rounded px-1.5 py-0.5">
          0:12
        </span>
      </div>

      {/* 텍스트 영역 — 클릭 시 재생 하이라이트 */}
      <div className="relative px-3 pb-2">
        <div className="text-[11px] text-neutral-700 dark:text-neutral-200 leading-relaxed">
          오늘 회의에서 논의할 주요 안건을 정리해 보겠습니다.
        </div>
        {/* 클릭 후 활성 하이라이트 (파란 배경) */}
        <div
          className="absolute inset-x-0 inset-y-0 rounded bg-blue-100/60 dark:bg-blue-500/15 ring-1 ring-blue-200 dark:ring-blue-500/40 animate-tour-demo-edit-appear"
        />
      </div>

      {/* 재생 인디케이터 (클릭 후 나타남) */}
      <div
        className="absolute bottom-2.5 right-3 flex items-center gap-1 animate-tour-demo-edit-appear"
      >
        <svg className="w-3 h-3 text-blue-500 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span className="text-[9px] text-blue-500 dark:text-blue-400 font-medium">0:12</span>
      </div>

      {/* 커서 — 텍스트 위로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '80px', '--cursor-y': '36px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-single-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 키워드 더블클릭 편집 데모 — 키워드 영역 + 더블클릭으로 편집 모드 전환
 * 사용: summary-keywords
 */
function DoubleClickKeywordsDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
      {/* 섹션 레이블 */}
      <div className="px-3 pt-2.5 pb-1.5">
        <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          키워드
        </span>
      </div>

      {/* 비편집 상태 (사라짐) */}
      <div className="mx-3 flex flex-wrap gap-1.5 animate-tour-demo-text-fade">
        <span className="inline-flex items-center px-2 py-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full text-[9px] font-medium">
          프로젝트
        </span>
        <span className="inline-flex items-center px-2 py-0.5 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded-full text-[9px] font-medium">
          회의록
        </span>
      </div>

      {/* 편집 상태 (나타남) */}
      <div className="absolute inset-x-3 top-[38px] animate-tour-demo-edit-appear">
        <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600
                        rounded-lg px-2.5 py-2 ring-2 ring-blue-500 dark:ring-blue-400">
          {/* 기존 태그 with x 버튼 */}
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full text-[9px] font-medium">
            프로젝트
            <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </span>
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded-full text-[9px] font-medium">
            회의록
            <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </span>
          {/* 새로 추가되는 태그 */}
          <span
            className="inline-flex items-center px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-[9px] font-medium"
            style={{ animation: 'tour-tag-appear 0.4s ease-out 2.2s forwards', opacity: 0 }}
          >
            AI
          </span>
          {/* 입력 커서 */}
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 flex items-center">
            <span className="inline-block w-[1px] h-3 bg-blue-500 dark:bg-blue-400 animate-pulse" />
          </span>
        </div>
      </div>

      {/* 커서 — 키워드 영역으로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '100px', '--cursor-y': '48px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-cursor-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 아이콘 클릭 데모 — 화자 카드 + 병합 드롭다운
 * 사용: speaker-merge
 */
function ClickIconDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
      {/* 화자 카드 헤더 */}
      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
        <span className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200 flex-1">화자 1</span>
        <span className="text-[9px] text-neutral-400 dark:text-neutral-500">5개 • 2:30 • 45%</span>
        {/* 병합 아이콘 */}
        <div className="p-1 rounded-md bg-neutral-100 dark:bg-neutral-700">
          <svg className="w-3 h-3 text-neutral-500 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
      </div>

      {/* 통계 바 */}
      <div className="mx-3 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden mb-1.5">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: '45%' }} />
      </div>

      {/* 병합 드롭다운 (나타남) */}
      <div
        className="absolute right-3 top-[36px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600
                   rounded-lg shadow-lg overflow-hidden min-w-[100px] z-10"
        style={{ animation: 'tour-expand 3.5s ease-in-out infinite', '--expand-h': '40px' } as React.CSSProperties}
      >
        <div className="px-2.5 py-1.5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-neutral-700 dark:text-neutral-300">화자 2</span>
        </div>
        <div className="px-2.5 py-1.5 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-[10px] text-neutral-700 dark:text-neutral-300">화자 3</span>
        </div>
      </div>

      {/* 커서 — 병합 아이콘 위치로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '248px', '--cursor-y': '14px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-single-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 화자 이름 클릭 편집 데모 — 화자 카드 + 클릭으로 편집 모드 전환
 * 사용: speaker-name-edit
 */
function ClickSpeakerEditDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
      {/* 화자 카드 */}
      <div className="flex items-center gap-3 py-3 px-4">
        {/* 색상 인디케이터 */}
        <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />

        {/* 이름 영역 (클릭 전 → 클릭 후 input) */}
        <div className="flex-1 min-w-0 relative">
          {/* 클릭 전: 버튼 상태 (사라짐) */}
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 animate-tour-demo-text-fade">
            화자 1
          </div>

          {/* 클릭 후: input 편집 상태 (나타남) */}
          <input
            type="text"
            value="화자 1"
            readOnly
            className="absolute inset-0 w-full px-2 py-1 text-sm font-medium bg-white dark:bg-neutral-700
                     border border-neutral-300 dark:border-neutral-600 rounded
                     ring-2 ring-blue-500 dark:ring-blue-400
                     animate-tour-demo-edit-appear
                     focus:outline-none"
          />
        </div>

        {/* 통계 정보 */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
          <span>5개</span>
          <span>•</span>
          <span>2:30</span>
          <span>•</span>
          <span>45%</span>
        </div>
      </div>

      {/* 통계 바 */}
      <div className="mx-4 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: '45%' }} />
      </div>

      {/* 커서 — 화자 이름 위치로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '60px', '--cursor-y': '18px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-single-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 할일 더블클릭 편집 데모 — 할일 리스트 + 더블클릭으로 편집 모드 전환
 * 사용: summary-actions
 */
function DoubleClickActionsDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
      {/* 섹션 레이블 */}
      <div className="px-3 pt-2.5 pb-1.5">
        <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          할 일
        </span>
      </div>

      {/* 비편집 상태 (사라짐) */}
      <div className="px-3 space-y-1 animate-tour-demo-text-fade">
        <div className="text-[11px] text-neutral-700 dark:text-neutral-200 leading-relaxed">
          • 회의록 정리 및 공유
        </div>
        <div className="text-[11px] text-neutral-700 dark:text-neutral-200 leading-relaxed">
          • 다음 주 일정 확인
        </div>
      </div>

      {/* 편집 상태 (나타남) */}
      <div className="absolute inset-x-3 top-[38px] space-y-1.5 animate-tour-demo-edit-appear">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value="회의록 정리 및 공유"
            readOnly
            className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-neutral-700
                     border border-neutral-300 dark:border-neutral-600 rounded
                     focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button className="p-1 text-neutral-400 hover:text-red-500">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value="다음 주 일정 확인"
            readOnly
            className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-neutral-700
                     border border-neutral-300 dark:border-neutral-600 rounded
                     focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button className="p-1 text-neutral-400 hover:text-red-500">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 커서 — 할일 리스트 영역으로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '80px', '--cursor-y': '52px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-cursor-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 요약 더블클릭 편집 데모 — 요약 텍스트 영역 + 더블클릭으로 편집 모드 전환
 * 사용: summary-main-topic
 */
function DoubleClickMainTopicDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
      {/* 섹션 레이블 */}
      <div className="px-3 pt-2.5 pb-1.5">
        <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          요약
        </span>
      </div>

      {/* 비편집 상태 (사라짐) */}
      <div className="px-3 pb-2 animate-tour-demo-text-fade">
        <p className="text-[11px] text-neutral-700 dark:text-neutral-200 leading-relaxed">
          오늘 회의에서는 1분기 목표 달성을 위한 세부 계획을 논의했습니다. 각 팀의 역할과 일정을 확정하고...
        </p>
      </div>

      {/* 편집 상태 (나타남) */}
      <div className="absolute inset-x-3 top-[38px] bottom-2 animate-tour-demo-edit-appear">
        <textarea
          value="오늘 회의에서는 1분기 목표 달성을 위한 세부 계획을 논의했습니다. 각 팀의 역할과 일정을 확정하고..."
          readOnly
          className="w-full h-full px-2 py-1.5 text-[11px] text-neutral-700 dark:text-neutral-200
                   leading-relaxed bg-white dark:bg-neutral-700
                   border border-neutral-300 dark:border-neutral-600 rounded
                   ring-2 ring-blue-500 dark:ring-blue-400
                   resize-none focus:outline-none"
        />
      </div>

      {/* 커서 — 요약 텍스트 영역으로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '100px', '--cursor-y': '50px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-cursor-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 발화 목록 펼치기/접기 데모 — 화자 카드 + 발화 목록 토글
 * 사용: speaker-utterances
 */
function ExpandCollapseUtterancesDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    border border-neutral-200 dark:border-neutral-700">
      {/* 화자 카드 헤더 */}
      <div className="flex items-center gap-3 py-3 px-4 bg-white dark:bg-neutral-800">
        {/* 색상 인디케이터 */}
        <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />

        {/* 이름 */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            화자 1
          </span>
        </div>

        {/* 통계 */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
          <span>5개</span>
          <span>•</span>
          <span>2:30</span>
          <span>•</span>
          <span>45%</span>
        </div>

        {/* 발화 목록 토글 버튼 */}
        <button className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400">
          <svg
            className="w-4 h-4 animate-tour-arrow-rotate"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 발화 목록 (펼쳐지는 영역) */}
      <div
        className="border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 overflow-hidden"
        style={{ animation: 'tour-expand 3.5s ease-in-out infinite', '--expand-h': '36px' } as React.CSSProperties}
      >
        <div className="p-2 space-y-1">
          {/* 발화 항목 1 */}
          <button className="w-full text-left px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800">
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 text-xs font-mono text-neutral-500 dark:text-neutral-400">
                0:12
              </span>
              <p className="flex-1 text-sm text-neutral-700 dark:text-neutral-300 truncate">
                오늘 회의에서 논의할 주요 안건...
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* 커서 — 펼치기 버튼으로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '242px', '--cursor-y': '18px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-single-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 구간별 요약 더블클릭 편집 데모 — 구간 제목/내용 + 더블클릭으로 편집 모드 전환
 * 사용: summary-sections
 */
function DoubleClickSectionsDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
      {/* 섹션 레이블 */}
      <div className="px-3 pt-2.5 pb-1.5">
        <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          구간별 요약
        </span>
      </div>

      {/* 비편집 상태 (사라짐) */}
      <div className="mx-3 animate-tour-demo-text-fade">
        {/* 섹션 카드 */}
        <div className="bg-white dark:bg-neutral-700 rounded-sm border border-neutral-200 dark:border-neutral-600 p-2 relative">
          {/* 접기/펼치기 버튼 */}
          <button className="absolute top-1.5 right-1.5 p-0.5 text-neutral-400 dark:text-neutral-500">
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* 제목 + 시간 */}
          <div className="flex items-center justify-between gap-1.5 pr-4 mb-1">
            <h4 className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
              1. 프로젝트 개요
            </h4>
            <span className="inline-flex items-center gap-0.5 text-neutral-600 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-600 rounded-md text-[9px] py-0.5 px-1">
              <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
              0:12-0:45
            </span>
          </div>

          {/* 내용 */}
          <p className="text-[10px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
            새로운 프로젝트의 목표와 범위를 설명합니다.
          </p>
        </div>
      </div>

      {/* 편집 상태 (나타남) */}
      <div className="absolute inset-x-3 top-[38px] animate-tour-demo-edit-appear">
        <div className="bg-white dark:bg-neutral-700 rounded-sm border border-neutral-200 dark:border-neutral-600 p-2 relative">
          {/* 접기/펼치기 버튼 */}
          <button className="absolute top-1.5 right-1.5 p-0.5 text-neutral-400 dark:text-neutral-500">
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* 제목 편집 input + 시간 */}
          <div className="flex items-center justify-between gap-1.5 pr-4 mb-1">
            <input
              type="text"
              value="1. 프로젝트 개요"
              readOnly
              className="flex-1 text-[11px] font-semibold bg-white dark:bg-neutral-600
                       border border-neutral-300 dark:border-neutral-500 rounded
                       ring-2 ring-blue-500 dark:ring-blue-400
                       p-0.5 focus:outline-none"
            />
            <span className="inline-flex items-center gap-0.5 text-neutral-600 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-600 rounded-md text-[9px] py-0.5 px-1 flex-shrink-0">
              <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
              0:12-0:45
            </span>
          </div>

          {/* 내용 (편집 안함) */}
          <p className="text-[10px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
            새로운 프로젝트의 목표와 범위를 설명합니다.
          </p>
        </div>
      </div>

      {/* 커서 — 섹션 제목으로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '80px', '--cursor-y': '50px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-cursor-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 모바일 탭 네비게이션 데모 — 3개 탭 전환 (녹음 내용, 요약, 화자)
 * 사용: tab-nav-mobile
 */
function TabNavMobileDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
      {/* 상단 헤더 영역 */}
      <div className="px-3 pt-2.5 pb-1.5">
        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
          노트 제목
        </span>
      </div>

      {/* 3개 탭 네비게이션 */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-700">
        {/* 탭 1: 녹음 내용 (초기 활성) */}
        <button className="flex-1 px-3 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 relative">
          녹음 내용
          {/* 초기 인디케이터 (사라짐) */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 dark:bg-blue-400 animate-tour-demo-text-fade" />
        </button>

        {/* 탭 2: 요약 (활성화됨) */}
        <button className="flex-1 px-3 py-2 text-xs font-medium relative animate-tour-demo-edit-appear text-blue-600 dark:text-blue-400">
          요약
          {/* 새 인디케이터 (나타남) */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 dark:bg-blue-400" />
        </button>

        {/* 탭 3: 화자 */}
        <button className="flex-1 px-3 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          화자
        </button>
      </div>

      {/* 탭 컨텐츠 영역 미리보기 */}
      <div className="p-3">
        <div className="text-[10px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
          요약 내용이 여기에 표시됩니다...
        </div>
      </div>

      {/* 커서 — 요약 탭으로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '136px', '--cursor-y': '42px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-single-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

/**
 * 데스크톱 탭 네비게이션 데모 — 2개 탭 전환 (요약, 화자)
 * 사용: tab-nav-desktop
 */
function TabNavDesktopDemo() {
  return (
    <div className="relative w-full max-w-[272px] h-[96px] mx-auto rounded-lg overflow-hidden
                    bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
      {/* 상단 헤더 영역 */}
      <div className="px-3 pt-2.5 pb-1.5">
        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
          오른쪽 패널
        </span>
      </div>

      {/* 2개 탭 네비게이션 */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-700">
        {/* 탭 1: 요약 (초기 활성) */}
        <button className="flex-1 px-3 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 relative">
          요약
          {/* 초기 인디케이터 (사라짐) */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 dark:bg-blue-400 animate-tour-demo-text-fade" />
        </button>

        {/* 탭 2: 화자 (활성화됨) */}
        <button className="flex-1 px-3 py-2 text-xs font-medium relative animate-tour-demo-edit-appear text-blue-600 dark:text-blue-400">
          화자
          {/* 새 인디케이터 (나타남) */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 dark:bg-blue-400" />
        </button>
      </div>

      {/* 탭 컨텐츠 영역 미리보기 */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-200">화자 1</span>
        </div>
        <div className="text-[10px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
          화자 정보가 여기에 표시됩니다...
        </div>
      </div>

      {/* 커서 — 화자 탭으로 이동 */}
      <div
        className="absolute top-0 left-0 animate-tour-cursor-move"
        style={{ '--cursor-x': '204px', '--cursor-y': '42px' } as React.CSSProperties}
      >
        <CursorIcon
          size={14}
          className="animate-tour-single-click text-neutral-800 dark:text-neutral-100 drop-shadow-md"
        />
      </div>
    </div>
  );
}

const DEMO_MAP: Record<DemoAnimationType, React.FC> = {
  'double-click': DoubleClickDemo,
  'click': ClickDemo,
  'click-text': ClickTextDemo,
  'click-icon': ClickIconDemo,
  'click-speaker-edit': ClickSpeakerEditDemo,
  'double-click-actions': DoubleClickActionsDemo,
  'double-click-main-topic': DoubleClickMainTopicDemo,
  'double-click-keywords': DoubleClickKeywordsDemo,
  'double-click-sections': DoubleClickSectionsDemo,
  'expand-collapse-utterances': ExpandCollapseUtterancesDemo,
  'tab-nav-mobile': TabNavMobileDemo,
  'tab-nav-desktop': TabNavDesktopDemo,
};

export default function TourDemoAnimation({ type }: TourDemoAnimationProps) {
  const DemoComponent = DEMO_MAP[type];
  if (!DemoComponent) return null;

  return (
    <div className="px-4 my-2">
      <DemoComponent />
    </div>
  );
}
