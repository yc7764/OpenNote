'use client';

import React, { useState, useMemo, useRef, KeyboardEvent, useCallback } from 'react';
import type { Summary } from '@/types/note';
import type { LiveOverrides, LockedFields } from '@/hooks/useNoteSocket';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useClickOutside } from '@/hooks/useClickOutside';
import GuideHint from '@/components/onboarding/GuideHint';

interface NoteSummaryProps {
  summary: Summary | null;
  formatTime: (seconds: number) => string;
  // Socket editing props
  liveOverrides?: LiveOverrides;
  // Lock 상태
  lockedFields?: LockedFields;
  // Main Topic
  isEditingMainTopic?: boolean;
  editingMainTopicText?: string;
  onMainTopicDoubleClick?: () => void;
  onMainTopicTextChange?: (newText: string) => void;
  onFinishMainTopicEditing?: () => void;
  // Next Action
  isEditingNextAction?: boolean;
  editingNextActionText?: string;
  onNextActionDoubleClick?: () => void;
  onNextActionTextChange?: (newText: string) => void;
  onFinishNextActionEditing?: () => void;
  // Keywords
  isEditingKeywords?: boolean;
  editingKeywordsText?: string;
  onKeywordsDoubleClick?: () => void;
  onKeywordsTextChange?: (newText: string) => void;
  onFinishKeywordsEditing?: () => void;
  // Section
  editingSection?: { order: number | null; field: 'title' | 'content' | null };
  editingSectionText?: string;
  onSectionDoubleClick?: (order: number, field: 'title' | 'content', currentText: string) => void;
  onSectionTextChange?: (newText: string) => void;
  onFinishSectionEditing?: () => void;
}

const KEYWORD_COLORS = [
  { lightBg: 'bg-blue-100', lightText: 'text-blue-800', darkBg: 'dark:bg-blue-900/40', darkText: 'dark:text-blue-300' },
  { lightBg: 'bg-green-100', lightText: 'text-green-800', darkBg: 'dark:bg-green-900/40', darkText: 'dark:text-green-300' },
  { lightBg: 'bg-amber-100', lightText: 'text-amber-800', darkBg: 'dark:bg-amber-900/40', darkText: 'dark:text-amber-300' },
  { lightBg: 'bg-purple-100', lightText: 'text-purple-800', darkBg: 'dark:bg-purple-900/40', darkText: 'dark:text-purple-300' },
  { lightBg: 'bg-red-100', lightText: 'text-red-800', darkBg: 'dark:bg-red-900/40', darkText: 'dark:text-red-300' },
  { lightBg: 'bg-indigo-100', lightText: 'text-indigo-800', darkBg: 'dark:bg-indigo-900/40', darkText: 'dark:text-indigo-300' },
  { lightBg: 'bg-teal-100', lightText: 'text-teal-800', darkBg: 'dark:bg-teal-900/40', darkText: 'dark:text-teal-300' },
];

const NoteSummary: React.FC<NoteSummaryProps> = ({
  summary,
  formatTime,
  // Socket editing props
  liveOverrides,
  // Lock 상태
  lockedFields,
  isEditingMainTopic = false,
  editingMainTopicText = '',
  onMainTopicDoubleClick,
  onMainTopicTextChange,
  onFinishMainTopicEditing,
  isEditingNextAction = false,
  editingNextActionText = '',
  onNextActionDoubleClick,
  onNextActionTextChange,
  onFinishNextActionEditing,
  isEditingKeywords = false,
  editingKeywordsText = '',
  onKeywordsDoubleClick,
  onKeywordsTextChange,
  onFinishKeywordsEditing,
  editingSection = { order: null, field: null },
  editingSectionText = '',
  onSectionDoubleClick,
  onSectionTextChange,
  onFinishSectionEditing,
}) => {
  const isMobile = useIsMobile();
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const keywordContainerRef = useRef<HTMLDivElement>(null);
  const actionContainerRef = useRef<HTMLDivElement>(null);

  // 키워드 편집용 내부 상태
  const [keywordInputValue, setKeywordInputValue] = useState('');

  // 키워드 영역 외부 클릭 시 편집 종료
  const handleFinishKeywords = useCallback(() => {
    if (keywordInputValue.trim()) {
      const trimmed = keywordInputValue.trim();
      const currentKeywords = editingKeywordsText
        ? editingKeywordsText.split(',').map(k => k.trim()).filter(k => k)
        : [];
      if (!currentKeywords.includes(trimmed)) {
        onKeywordsTextChange?.([...currentKeywords, trimmed].join(', '));
      }
      setKeywordInputValue('');
    }
    onFinishKeywordsEditing?.();
  }, [keywordInputValue, editingKeywordsText, onKeywordsTextChange, onFinishKeywordsEditing]);

  useClickOutside(keywordContainerRef, handleFinishKeywords, isEditingKeywords);

  // 할일 영역 외부 클릭 시 편집 종료
  const handleFinishActions = useCallback(() => {
    // 빈 항목 제거 후 저장
    const items = editingNextActionText
      ? editingNextActionText.split(/[\n\r]+/).map(item => item.trim()).filter(item => item)
      : [];
    onNextActionTextChange?.(items.join('\n'));
    onFinishNextActionEditing?.();
  }, [editingNextActionText, onNextActionTextChange, onFinishNextActionEditing]);

  useClickOutside(actionContainerRef, handleFinishActions, isEditingNextAction);

  // editingKeywordsText를 배열로 파싱
  const editingKeywords = useMemo(() => {
    if (!editingKeywordsText) return [];
    return editingKeywordsText.split(',').map(k => k.trim()).filter(k => k);
  }, [editingKeywordsText]);

  // 키워드 추가
  const addKeyword = (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    if (editingKeywords.includes(trimmed)) return;
    const newKeywords = [...editingKeywords, trimmed];
    onKeywordsTextChange?.(newKeywords.join(', '));
    setKeywordInputValue('');
  };

  // 키워드 삭제
  const removeKeyword = (indexToRemove: number) => {
    const newKeywords = editingKeywords.filter((_, index) => index !== indexToRemove);
    onKeywordsTextChange?.(newKeywords.join(', '));
  };

  // 키워드 입력 키보드 핸들러
  const handleKeywordKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword(keywordInputValue);
    } else if (e.key === 'Backspace' && keywordInputValue === '' && editingKeywords.length > 0) {
      removeKeyword(editingKeywords.length - 1);
    }
  };

  // 키워드 입력 변경 핸들러
  const handleKeywordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.includes(',')) {
      const parts = value.split(',');
      parts.forEach((part, idx) => {
        if (idx < parts.length - 1) {
          addKeyword(part);
        } else {
          setKeywordInputValue(part);
        }
      });
    } else {
      setKeywordInputValue(value);
    }
  };

  // editingNextActionText를 배열로 파싱 (편집 시 사용)
  // 편집 중에는 trim()을 적용하지 않음 (끝 공백 유지)
  const editingActionItems = useMemo(() => {
    if (!editingNextActionText) return [''];
    const items = editingNextActionText.split(/[\n\r]+/);
    return items.length > 0 ? items : [''];
  }, [editingNextActionText]);

  // 할일 항목 업데이트
  const updateActionItem = (index: number, newText: string) => {
    const newItems = [...editingActionItems];
    newItems[index] = newText;
    onNextActionTextChange?.(newItems.join('\n'));
  };

  // 할일 항목 삭제
  const removeActionItem = (indexToRemove: number) => {
    const newItems = editingActionItems.filter((_, index) => index !== indexToRemove);
    if (newItems.length === 0) {
      onNextActionTextChange?.('');
    } else {
      onNextActionTextChange?.(newItems.join('\n'));
    }
  };

  // 할일 항목 추가
  const addActionItem = () => {
    const newItems = [...editingActionItems, ''];
    onNextActionTextChange?.(newItems.join('\n'));
  };

  // Parse next_actions into action items array
  const parseActionItems = (nextActions: string | null | undefined): string[] => {
    if (!nextActions) return [];

    // Try to split by newlines, bullets, or numbered lists
    const items = nextActions
      .split(/[\n\r]+/)
      .map(item => item.replace(/^[\s\-•·\d.]+/, '').trim())
      .filter(item => item.length > 0);

    return items.length > 0 ? items : [nextActions];
  };

  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

  const toggleSectionCollapse = (order: number) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(order)) {
        newSet.delete(order);
      } else {
        newSet.add(order);
      }
      return newSet;
    });
  };

  const expandAllSections = () => {
    setCollapsedSections(new Set());
  };

  const collapseAllSections = () => {
    if (summary?.sections) {
      setCollapsedSections(new Set(summary.sections.map(s => s.order)));
    }
  };

  // Get display values from liveOverrides or summary
  const displayMainTopic = liveOverrides?.main_topic ?? summary?.main_topic;
  const displayNextActions = liveOverrides?.next_action ?? summary?.next_actions;
  const displayKeywords = liveOverrides?.keywords ?? summary?.keywords ?? [];

  const actionItems = parseActionItems(displayNextActions);

  if (!summary) {
    return (
      <div className="bg-neutral-50 dark:bg-neutral-800 h-full overflow-hidden flex-1 min-w-[280px] transition-colors duration-200">
        <div className={`flex flex-col items-center justify-center h-full text-center text-neutral-500 dark:text-neutral-400 ${isMobile ? 'p-6' : 'p-10'}`}>
          <div className="mb-4 text-neutral-400 dark:text-neutral-500">
            <svg width={isMobile ? "36" : "48"} height={isMobile ? "36" : "48"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          </div>
          <h3 className={`text-neutral-700 dark:text-neutral-200 font-semibold mb-2 ${isMobile ? 'text-base' : 'text-lg'}`}>요약 정보 없음</h3>
          <p className={`text-neutral-500 dark:text-neutral-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>AI가 요약을 생성 중이거나 요약 정보가 없습니다.</p>
        </div>
      </div>
    );
  }

  // 모바일: 컴팩트 패딩, 데스크톱: 원본 패딩
  const containerPadding = isMobile ? 'p-3' : 'p-5';
  const sectionMargin = isMobile ? 'mb-4' : 'mb-6';
  const headerMargin = isMobile ? 'mb-2' : 'mb-3';

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800 h-full overflow-hidden flex-1 min-w-[280px] transition-colors duration-200">
      <div className={`h-full overflow-y-auto ${containerPadding} scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent`}>
        {/* Keywords Section */}
        <section className={`${sectionMargin} relative ${lockedFields?.keywords ? 'opacity-60' : ''}`}>
          {lockedFields?.keywords && (
            <div className="absolute top-0 right-0 text-neutral-400 dark:text-neutral-500">
              <svg width={isMobile ? "12" : "14"} height={isMobile ? "12" : "14"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
          )}
          <div className={`flex items-center gap-2 ${headerMargin}`}>
            <span className={`text-neutral-600 dark:text-neutral-300 font-semibold ${isMobile ? 'text-sm' : 'text-base'}`}>#</span>
            <h3 className={`font-semibold text-neutral-600 dark:text-neutral-300 tracking-wide ${isMobile ? 'text-sm' : 'text-base'}`}>키워드</h3>
            <GuideHint stepId="summary-keywords" />
          </div>
          <div
            className={`flex flex-wrap cursor-pointer ${isMobile ? 'gap-1.5' : 'gap-2'}`}
            data-tour-target="summary-keywords"
            onDoubleClick={!isEditingKeywords ? onKeywordsDoubleClick : undefined}
          >
            {isEditingKeywords ? (
              <div
                ref={keywordContainerRef}
                onClick={() => keywordInputRef.current?.focus()}
                className={`w-full flex flex-wrap gap-2 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg cursor-text focus-within:ring-2 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 focus-within:border-transparent transition-all ${isMobile ? 'p-2 min-h-[40px]' : 'p-3 min-h-[48px]'}`}
              >
                {editingKeywords.map((keyword, index) => {
                  const colorIndex = index % KEYWORD_COLORS.length;
                  const color = KEYWORD_COLORS[colorIndex];
                  return (
                    <span
                      key={index}
                      className={`inline-flex items-center gap-1 rounded-full font-medium ${color.lightBg} ${color.lightText} ${color.darkBg} ${color.darkText} ${isMobile ? 'py-0.5 px-2 text-xs' : 'py-1 px-2.5 text-sm'}`}
                    >
                      {keyword}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeKeyword(index);
                        }}
                        className={`ml-0.5 p-0.5 rounded transition-colors ${isMobile ? 'hover:bg-black/10 dark:hover:bg-white/10' : 'hover:bg-black/10 dark:hover:bg-white/10'}`}
                        aria-label={`${keyword} 삭제`}
                      >
                        <svg className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  );
                })}
                <input
                  ref={keywordInputRef}
                  type="text"
                  value={keywordInputValue}
                  onChange={handleKeywordInputChange}
                  onKeyDown={handleKeywordKeyDown}
                  placeholder={editingKeywords.length === 0 ? '키워드 입력 후 Enter' : ''}
                  className={`flex-1 min-w-[80px] bg-transparent outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 ${isMobile ? 'text-xs' : 'text-sm'}`}
                  autoFocus
                />
              </div>
            ) : (displayKeywords && Array.isArray(displayKeywords) && displayKeywords.length > 0) ? (
              displayKeywords.map((keyword, index) => {
                const colorIndex = index % KEYWORD_COLORS.length;
                const color = KEYWORD_COLORS[colorIndex];
                return (
                  <span
                    key={index}
                    className={`inline-flex items-center rounded-full font-medium transition-all hover:-translate-y-0.5 hover:shadow-md ${color.lightBg} ${color.lightText} ${color.darkBg} ${color.darkText} ${isMobile ? 'py-1 px-2.5 text-sm' : 'py-1.5 px-3.5 text-base'}`}
                  >
                    {keyword}
                  </span>
                );
              })
            ) : (
              <span className={`text-neutral-400 dark:text-neutral-500 italic ${isMobile ? 'text-xs' : 'text-sm'}`}>키워드가 없습니다.</span>
            )}
          </div>
        </section>

        {/* Action Items Section */}
        <section className={`${sectionMargin} relative ${lockedFields?.next_action ? 'opacity-60' : ''}`}>
          {lockedFields?.next_action && (
            <div className="absolute top-0 right-0 text-neutral-400 dark:text-neutral-500">
              <svg width={isMobile ? "12" : "14"} height={isMobile ? "12" : "14"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
          )}
          <div className={`flex items-center gap-2 ${headerMargin}`}>
            <span className={`text-neutral-600 dark:text-neutral-300 font-semibold flex items-center ${isMobile ? 'text-sm' : 'text-base'}`}>
              <svg width={isMobile ? "14" : "16"} height={isMobile ? "14" : "16"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="9,11 12,14 22,4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            </span>
            <h3 className={`font-semibold text-neutral-600 dark:text-neutral-300 tracking-wide ${isMobile ? 'text-sm' : 'text-base'}`}>할 일</h3>
            <GuideHint stepId="summary-actions" />
          </div>
          <div
            className={`flex flex-col ${isMobile ? 'gap-1' : 'gap-2'}`}
            data-tour-target="summary-actions"
          >
            {isEditingNextAction ? (
              <div
                ref={actionContainerRef}
                className={`flex flex-col bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg ${isMobile ? 'p-2 gap-1' : 'p-2.5 gap-1.5'}`}
              >
                {editingActionItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => updateActionItem(index, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          // 마지막 항목에서 Enter 시 새 항목 추가
                          if (index === editingActionItems.length - 1) {
                            addActionItem();
                          }
                        }
                      }}
                      placeholder="할 일 입력..."
                      className={`flex-1 bg-neutral-50 dark:bg-neutral-600 border border-neutral-200 dark:border-neutral-500 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 ${isMobile ? 'text-xs' : 'text-sm'}`}
                      autoFocus={index === 0}
                    />
                    <button
                      type="button"
                      onClick={() => removeActionItem(index)}
                      className={`flex-shrink-0 text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400 transition-colors ${isMobile ? 'p-1' : 'p-1.5'}`}
                      aria-label="항목 삭제"
                    >
                      <svg className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={addActionItem}
                    className={`flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors ${isMobile ? 'text-xs' : 'text-sm'}`}
                  >
                    <svg className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    항목 추가
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => {
                      // 빈 항목 제거 후 저장
                      const filteredItems = editingActionItems.filter(item => item.trim());
                      onNextActionTextChange?.(filteredItems.join('\n'));
                      onFinishNextActionEditing?.();
                    }}
                    className={`px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors ${isMobile ? 'text-xs' : 'text-sm'}`}
                  >
                    완료
                  </button>
                </div>
              </div>
            ) : actionItems.length > 0 ? (
              actionItems.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-start cursor-pointer ${isMobile ? 'gap-2 py-1' : 'gap-2.5 py-1.5'}`}
                  onDoubleClick={() => onNextActionDoubleClick?.()}
                >
                  <span className={`text-neutral-400 dark:text-neutral-500 flex-shrink-0 ${isMobile ? 'text-sm' : 'text-base'}`}>•</span>
                  <span className={`text-neutral-700 dark:text-neutral-200 leading-relaxed ${isMobile ? 'text-sm' : 'text-base'}`}>
                    {item}
                  </span>
                </div>
              ))
            ) : (
              <span className={`text-neutral-400 dark:text-neutral-500 italic ${isMobile ? 'text-sm' : 'text-base'}`}>액션 아이템이 없습니다.</span>
            )}
          </div>
        </section>

        {/* Summary Section */}
        <section className={`${sectionMargin} relative ${lockedFields?.main_topic ? 'opacity-60' : ''}`}>
          {lockedFields?.main_topic && (
            <div className="absolute top-0 right-0 text-neutral-400 dark:text-neutral-500">
              <svg width={isMobile ? "12" : "14"} height={isMobile ? "12" : "14"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
          )}
          <div className={`flex items-center gap-2 ${headerMargin}`}>
            <span className={`text-neutral-600 dark:text-neutral-300 font-semibold flex items-center ${isMobile ? 'text-sm' : 'text-base'}`}>
              <svg width={isMobile ? "14" : "16"} height={isMobile ? "14" : "16"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </span>
            <h3 className={`font-semibold text-neutral-600 dark:text-neutral-300 tracking-wide ${isMobile ? 'text-sm' : 'text-base'}`}>요약</h3>
            <GuideHint stepId="summary-main-topic" />
          </div>
          <div
            className="cursor-pointer"
            onDoubleClick={onMainTopicDoubleClick}
            data-tour-target="summary-main-topic"
          >
            {isEditingMainTopic ? (
              <textarea
                value={editingMainTopicText}
                onChange={(e) => onMainTopicTextChange?.(e.target.value)}
                onBlur={onFinishMainTopicEditing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    onFinishMainTopicEditing?.();
                  }
                }}
                className={`w-full bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${isMobile ? 'min-h-[60px] p-1.5 text-sm' : 'min-h-[80px] p-2 text-base'}`}
                autoFocus
              />
            ) : displayMainTopic ? (
              <p className={`text-neutral-600 dark:text-neutral-300 leading-relaxed ${isMobile ? 'text-sm' : 'text-base'}`}>
                {displayMainTopic}
              </p>
            ) : (
              <span className={`text-neutral-400 dark:text-neutral-500 italic ${isMobile ? 'text-sm' : 'text-base'}`}>요약이 생성 중입니다...</span>
            )}
          </div>
        </section>

        {/* Section Summary */}
        <section className={`${sectionMargin} last:mb-0`}>
          <div className={`flex items-center justify-between ${headerMargin}`}>
            <div className="flex items-center gap-2">
              <span className={`text-neutral-600 dark:text-neutral-300 font-semibold flex items-center ${isMobile ? 'text-sm' : 'text-base'}`}>
                <svg width={isMobile ? "14" : "16"} height={isMobile ? "14" : "16"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <line x1="8" y1="6" x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/>
                  <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </span>
              <h3 className={`font-semibold text-neutral-600 dark:text-neutral-300 tracking-wide ${isMobile ? 'text-sm' : 'text-base'}`}>구간별 요약</h3>
              <GuideHint stepId="summary-sections" />
            </div>
            {/* 전체 펼치기/접기 버튼 */}
            {summary.sections && summary.sections.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={expandAllSections}
                  className={`p-1 rounded text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors ${collapsedSections.size === 0 ? 'opacity-50' : ''}`}
                  title="모두 펼치기"
                  disabled={collapsedSections.size === 0}
                >
                  <svg width={isMobile ? "14" : "16"} height={isMobile ? "14" : "16"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="7 13 12 18 17 13"/>
                    <polyline points="7 6 12 11 17 6"/>
                  </svg>
                </button>
                <button
                  onClick={collapseAllSections}
                  className={`p-1 rounded text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors ${collapsedSections.size === summary.sections.length ? 'opacity-50' : ''}`}
                  title="모두 접기"
                  disabled={collapsedSections.size === summary.sections.length}
                >
                  <svg width={isMobile ? "14" : "16"} height={isMobile ? "14" : "16"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="17 11 12 6 7 11"/>
                    <polyline points="17 18 12 13 7 18"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
          <div className={`flex flex-col ${isMobile ? 'gap-2' : 'gap-4'}`}>
            {summary.sections && summary.sections.length > 0 ? (
              summary.sections.map((section, index) => {
                const sectionIdStr = String(section.order);
                const overrideSection = liveOverrides?.sections.get(sectionIdStr);
                const displayTitle = overrideSection?.title ?? section.title;
                const displayContent = overrideSection?.content ?? section.content;
                const isEditingTitle = editingSection.order === section.order && editingSection.field === 'title';
                const isEditingContent = editingSection.order === section.order && editingSection.field === 'content';
                const isSectionLocked = lockedFields?.sections.has(sectionIdStr);
                const isCollapsed = collapsedSections.has(section.order);

                return (
                  <div key={index} className={`bg-white dark:bg-neutral-700 rounded-sm border border-neutral-200 dark:border-neutral-600 relative ${isSectionLocked ? 'opacity-60' : ''} ${isMobile ? 'p-2' : 'p-3'}`} {...(index === 0 ? { 'data-tour-target': 'summary-sections' } : {})}>
                    {isSectionLocked && (
                      <div className={`absolute text-neutral-400 dark:text-neutral-500 ${isMobile ? 'top-1.5 right-8' : 'top-2 right-10'}`}>
                        <svg width={isMobile ? "12" : "14"} height={isMobile ? "12" : "14"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </div>
                    )}
                    {/* 접기/펼치기 버튼 */}
                    <button
                      onClick={() => toggleSectionCollapse(section.order)}
                      className={`absolute text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors ${isMobile ? 'top-1.5 right-1.5 p-0.5' : 'top-2 right-2 p-1'}`}
                      title={isCollapsed ? "펼치기" : "접기"}
                    >
                      <svg
                        width={isMobile ? "12" : "14"}
                        height={isMobile ? "12" : "14"}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    <div className={`flex items-center justify-between flex-wrap pr-6 ${isCollapsed ? '' : isMobile ? 'mb-1.5' : 'mb-2'} ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
                      {isEditingTitle ? (
                        <input
                          type="text"
                          value={editingSectionText}
                          onChange={(e) => onSectionTextChange?.(e.target.value)}
                          onBlur={onFinishSectionEditing}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              onFinishSectionEditing?.();
                            }
                          }}
                          className={`flex-1 font-semibold bg-white dark:bg-neutral-600 border border-neutral-300 dark:border-neutral-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${isMobile ? 'p-0.5 text-sm' : 'p-1 text-base'}`}
                          autoFocus
                        />
                      ) : (
                        <h4
                          className={`font-semibold text-neutral-800 dark:text-neutral-100 cursor-pointer ${isMobile ? 'text-sm' : 'text-base'}`}
                          onDoubleClick={() => onSectionDoubleClick?.(section.order, 'title', displayTitle)}
                        >
                          {displayTitle}
                        </h4>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-600 rounded-md ${isMobile ? 'text-[10px] py-0.5 px-1.5' : 'text-xs py-1 px-2'}`}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <svg width={isMobile ? "10" : "12"} height={isMobile ? "10" : "12"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12,6 12,12 16,14"/>
                        </svg>
                        {formatTime(section.start_time)}-{formatTime(section.end_time)}
                      </span>
                    </div>
                    {/* 콘텐츠 영역 - 접힌 상태일 때 숨김 */}
                    {!isCollapsed && (
                      isEditingContent ? (
                        <textarea
                          value={editingSectionText}
                          onChange={(e) => onSectionTextChange?.(e.target.value)}
                          onBlur={onFinishSectionEditing}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.ctrlKey) {
                              e.preventDefault();
                              onFinishSectionEditing?.();
                            }
                          }}
                          className={`w-full bg-white dark:bg-neutral-600 border border-neutral-300 dark:border-neutral-500 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${isMobile ? 'min-h-[40px] p-1.5 text-sm' : 'min-h-[60px] p-2 text-base'}`}
                          autoFocus
                        />
                      ) : (
                        <p
                          className={`text-neutral-600 dark:text-neutral-300 leading-relaxed cursor-pointer ${isMobile ? 'text-sm' : 'text-base'}`}
                          onDoubleClick={() => onSectionDoubleClick?.(section.order, 'content', displayContent)}
                        >
                          {displayContent}
                        </p>
                      )
                    )}
                  </div>
                );
              })
            ) : (
              <span className={`text-neutral-400 dark:text-neutral-500 italic ${isMobile ? 'text-sm' : 'text-base'}`}>구간 요약이 생성 중입니다...</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default NoteSummary;
