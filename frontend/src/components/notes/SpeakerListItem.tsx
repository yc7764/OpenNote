'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Speaker, Segment } from '@/types/note';
import { SPEAKER_COLORS, sanitizeSpeakerName } from '@/constants/speakers';
import { UtteranceItem } from './UtteranceItem';
import { MergeConfirmModal } from './MergeConfirmModal';
import { AUTO_SAVE_TIMEOUT_MS, MAX_EDIT_DURATION_MS } from '@/constants/timeouts';

export interface SpeakerListItemProps {
  speakerId: string;
  speaker: Speaker;
  colorIndex: number;
  segmentCount: number;
  totalSegments: number;
  totalDuration: number; // seconds
  utterances: Segment[];
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (name: string) => void;
  onCancelEdit: () => void;
  allSpeakers: Record<string, Speaker>;
  onMerge?: (targetId: string) => void;
  onUtteranceClick?: (startTime: number, segmentId: string) => void;
  disabled?: boolean;
  formatTime: (seconds: number) => string;
  activeSegmentId?: string;
  tourTargetIds?: { name?: string; merge?: string; utterances?: string };
  /** 다른 사용자가 편집 중인지 여부 (lock 상태) */
  isLocked?: boolean;
}

const MAX_VISIBLE_UTTERANCES = 5;

/**
 * 개별 화자 카드 컴포넌트
 * 화자 정보, 통계, 인라인 편집, 병합, 발화 목록을 표시
 */
export function SpeakerListItem({
  speakerId,
  speaker,
  colorIndex,
  segmentCount,
  totalSegments,
  totalDuration,
  utterances,
  isEditing,
  onStartEdit,
  onSave,
  onCancelEdit,
  allSpeakers,
  onMerge,
  onUtteranceClick,
  disabled = false,
  formatTime,
  activeSegmentId,
  tourTargetIds,
  isLocked = false,
}: SpeakerListItemProps) {
  const [editValue, setEditValue] = useState(speaker.name);
  const [editError, setEditError] = useState<string | null>(null);
  const [showMergeDropdown, setShowMergeDropdown] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllUtterances, setShowAllUtterances] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mergeButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, openUp: false });

  // 타이머 관련 ref (segment 편집과 동일한 패턴)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const editStartTimeRef = useRef<number | null>(null);
  const executeAutoSaveRef = useRef<() => void>(() => {});

  const speakerColor = SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length];
  const percentage = totalSegments > 0 ? Math.round((segmentCount / totalSegments) * 100) : 0;

  // 타이머 클리어 함수
  const clearTimers = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  // 정렬된 발화 목록 (시간순)
  const sortedUtterances = useMemo(() => {
    return [...utterances].sort((a, b) => a.start - b.start);
  }, [utterances]);

  // 표시할 발화 목록
  const visibleUtterances = showAllUtterances
    ? sortedUtterances
    : sortedUtterances.slice(0, MAX_VISIBLE_UTTERANCES);

  const hasMoreUtterances = sortedUtterances.length > MAX_VISIBLE_UTTERANCES;

  // 자동 저장 실행 함수 (타이머에서 호출)
  const executeAutoSave = useCallback(() => {
    const sanitized = sanitizeSpeakerName(editValue);
    if (sanitized && sanitized !== speaker.name) {
      onSave(sanitized);
    } else {
      onCancelEdit();
    }
    clearTimers();
    editStartTimeRef.current = null;
  }, [editValue, speaker.name, onSave, onCancelEdit, clearTimers]);

  // ref를 매 렌더에 갱신 (useEditableField.ts의 finishEditingRef 패턴)
  executeAutoSaveRef.current = executeAutoSave;

  // 편집 모드 진입/종료 시 타이머 관리
  useEffect(() => {
    if (isEditing) {
      // 편집 시작 시간 기록
      editStartTimeRef.current = Date.now();
      // 자동 저장 타이머 시작
      autoSaveTimerRef.current = setTimeout(() => {
        executeAutoSaveRef.current();
      }, AUTO_SAVE_TIMEOUT_MS);
    } else {
      // 편집 종료 시 타이머 클리어
      clearTimers();
      editStartTimeRef.current = null;
    }

    return () => {
      clearTimers();
    };
  }, [isEditing, clearTimers]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(speaker.name);
  }, [speaker.name]);

  // 드롭다운 위치 계산
  const updateDropdownPosition = useCallback(() => {
    if (mergeButtonRef.current) {
      const rect = mergeButtonRef.current.getBoundingClientRect();
      const dropdownHeight = 200; // 예상 드롭다운 높이
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      setDropdownPosition({
        top: openUp ? rect.top : rect.bottom + 4,
        left: Math.max(8, rect.right - 192), // w-48 = 192px, 최소 8px 여백
        openUp,
      });
    }
  }, []);

  // 드롭다운 열릴 때 위치 계산
  useEffect(() => {
    if (showMergeDropdown) {
      updateDropdownPosition();
    }
  }, [showMergeDropdown, updateDropdownPosition]);

  // 외부 클릭 및 스크롤 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        mergeButtonRef.current &&
        !mergeButtonRef.current.contains(event.target as Node)
      ) {
        setShowMergeDropdown(false);
      }
    };

    const handleScroll = () => {
      setShowMergeDropdown(false);
    };

    if (showMergeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showMergeDropdown]);

  // 입력 변경 핸들러
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEditValue(value);
    // 에러 상태 초기화
    if (editError) {
      setEditError(null);
    }

    // 타이머 리셋 (segment 편집과 동일한 패턴)
    clearTimers();

    // 최대 편집 시간 체크 - 연속 타이핑해도 MAX_EDIT_DURATION_MS 후 강제 저장
    const elapsed = editStartTimeRef.current ? Date.now() - editStartTimeRef.current : 0;
    if (elapsed >= MAX_EDIT_DURATION_MS) {
      executeAutoSaveRef.current();
      return;
    }

    // 남은 시간과 AUTO_SAVE_TIMEOUT 중 작은 값 사용
    const remainingTime = MAX_EDIT_DURATION_MS - elapsed;
    const timeout = Math.min(AUTO_SAVE_TIMEOUT_MS, remainingTime);

    autoSaveTimerRef.current = setTimeout(() => {
      executeAutoSaveRef.current();
    }, timeout);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimers();
      editStartTimeRef.current = null;
      const sanitized = sanitizeSpeakerName(editValue);
      // 에러가 있으면 저장하지 않음
      if (editError) {
        return;
      }
      if (sanitized && sanitized !== speaker.name) {
        onSave(sanitized);
        setEditError(null);
      } else {
        setEditValue(speaker.name);
        setEditError(null);
        onCancelEdit();
      }
    } else if (e.key === 'Escape') {
      clearTimers();
      editStartTimeRef.current = null;
      setEditValue(speaker.name);
      setEditError(null);
      onCancelEdit();
    }
  };

  const handleBlur = () => {
    clearTimers();
    editStartTimeRef.current = null;
    const sanitized = sanitizeSpeakerName(editValue);
    // 에러가 있으면 저장하지 않고 원래 값으로 복원
    if (editError) {
      setEditValue(speaker.name);
      setEditError(null);
      onCancelEdit();
      return;
    }
    if (sanitized && sanitized !== speaker.name) {
      onSave(sanitized);
      setEditError(null);
    } else {
      setEditValue(speaker.name);
      setEditError(null);
      onCancelEdit();
    }
  };

  const mergeTargets = Object.entries(allSpeakers).filter(([id]) => id !== speakerId);

  return (
    <div className={`rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden ${disabled ? 'opacity-60' : ''}`}>
      <div className="py-3 px-4 bg-white dark:bg-neutral-800">
        <div className="flex items-center gap-3">
          {/* 색상 인디케이터 */}
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: speakerColor.light }}
            aria-hidden="true"
          />

          {/* 이름 (편집 가능) */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div>
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  className={`w-full px-2 py-1 text-sm font-medium bg-white dark:bg-neutral-700
                           border rounded focus:outline-none focus:ring-2
                           ${editError
                             ? 'border-red-500 focus:ring-red-500'
                             : 'border-neutral-300 dark:border-neutral-600 focus:ring-blue-500'
                           }`}
                  disabled={disabled}
                  maxLength={100}
                />
                {editError && (
                  <p className="mt-1 text-xs text-red-500">{editError}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => !disabled && !isLocked && onStartEdit()}
                  className={`text-sm font-medium truncate block text-left
                           focus:outline-none focus:underline
                           ${isLocked
                             ? 'text-neutral-400 dark:text-neutral-500 cursor-not-allowed'
                             : 'text-neutral-800 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-400'
                           }`}
                  disabled={disabled || isLocked}
                  title={isLocked ? '다른 사용자가 수정 중입니다' : '클릭하여 이름 편집'}
                  data-tour-target={tourTargetIds?.name}
                >
                  {speaker.name}
                </button>
                {isLocked && (
                  <div className="flex-shrink-0 text-neutral-400 dark:text-neutral-500" title="다른 사용자가 수정 중">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 병합 버튼 */}
          {mergeTargets.length > 0 && onMerge && (
            <>
              <button
                ref={mergeButtonRef}
                type="button"
                onClick={() => !disabled && setShowMergeDropdown(!showMergeDropdown)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700
                         hover:bg-neutral-100 dark:hover:bg-neutral-700
                         dark:text-neutral-400 dark:hover:text-neutral-200
                         focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                disabled={disabled}
                title="다른 화자와 병합"
                aria-expanded={showMergeDropdown}
                aria-haspopup="listbox"
                data-tour-target={tourTargetIds?.merge}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>

              {/* 병합 드롭다운 - Portal로 렌더링 */}
              {showMergeDropdown && createPortal(
                <div
                  ref={dropdownRef}
                  className="w-48 py-1 bg-white dark:bg-neutral-800 rounded-lg shadow-lg
                            border border-neutral-200 dark:border-neutral-700"
                  style={{
                    position: 'fixed',
                    top: dropdownPosition.openUp ? 'auto' : dropdownPosition.top,
                    bottom: dropdownPosition.openUp ? `${window.innerHeight - dropdownPosition.top + 4}px` : 'auto',
                    left: dropdownPosition.left,
                    zIndex: 9999,
                  }}
                  role="listbox"
                  aria-label="병합 대상 선택"
                >
                  <div className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-700">
                    병합 대상 선택
                  </div>
                  {mergeTargets.map(([targetId, targetSpeaker]) => {
                    const targetColor = SPEAKER_COLORS[
                      parseInt(targetId.replace('sp_', ''), 10) % SPEAKER_COLORS.length
                    ];
                    return (
                      <button
                        key={targetId}
                        type="button"
                        onClick={() => {
                          setMergeTarget({ id: targetId, name: targetSpeaker.name });
                          setShowMergeDropdown(false);
                        }}
                        className="w-full px-3 py-2 flex items-center gap-2 text-sm text-left
                                 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        role="option"
                        aria-selected={false}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: targetColor.light }}
                        />
                        <span className="truncate">{targetSpeaker.name}</span>
                      </button>
                    );
                  })}
                </div>,
                document.body
              )}

              {/* 병합 확인 모달 */}
              <MergeConfirmModal
                open={!!mergeTarget}
                sourceSpeakerName={speaker.name}
                targetSpeakerName={mergeTarget?.name ?? ''}
                onConfirm={() => {
                  if (mergeTarget) {
                    onMerge(mergeTarget.id);
                  }
                  setMergeTarget(null);
                }}
                onCancel={() => setMergeTarget(null)}
              />
            </>
          )}

          {/* 발화 목록 토글 */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700
                     hover:bg-neutral-100 dark:hover:bg-neutral-700
                     dark:text-neutral-400 dark:hover:text-neutral-200
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     transition-transform duration-200 flex-shrink-0"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? '발화 목록 접기' : '발화 목록 펼치기'}
            data-tour-target={tourTargetIds?.utterances}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* 두 번째 줄: 통계 */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mt-2 ml-6">
          <span>발화 {segmentCount}개</span>
          <span>•</span>
          <span>시간 {formatTime(totalDuration)}</span>
          <span>•</span>
          <span>비중 {percentage}%</span>
        </div>
      </div>

      {/* 발화 목록 (접이식) */}
      {isExpanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50">
          {sortedUtterances.length === 0 ? (
            <p className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400 italic">
              발화가 없습니다.
            </p>
          ) : (
            <>
              <div className="p-2 space-y-1 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
                {visibleUtterances.map((segment) => (
                  <UtteranceItem
                    key={segment.segment_id}
                    segment={segment}
                    formatTime={formatTime}
                    onClick={onUtteranceClick}
                    isActive={activeSegmentId === String(segment.segment_id)}
                  />
                ))}
              </div>

              {/* 더보기/접기 버튼 */}
              {hasMoreUtterances && (
                <div className="px-4 pb-3 border-t border-neutral-200 dark:border-neutral-700">
                  <button
                    type="button"
                    onClick={() => setShowAllUtterances(!showAllUtterances)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none pt-2"
                  >
                    {showAllUtterances
                      ? '간략히 보기'
                      : `${sortedUtterances.length - MAX_VISIBLE_UTTERANCES}개 더 보기`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
