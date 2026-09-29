"use client";
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { AUTO_SAVE_TIMEOUT_MS, MAX_EDIT_DURATION_MS } from '@/constants/timeouts';

// 필드명 한글 매핑
export const FIELD_NAME_MAP: Record<string, string> = {
  segment: '발화 내용',
  summary_text: '구간 요약',
  main_topic: '요약',
  keywords: '키워드',
  next_action: '할 일',
};

// 자동 저장 타임아웃 (60초) - 하위 호환성 유지
export const AUTO_REVERT_TIMEOUT_MS = AUTO_SAVE_TIMEOUT_MS;

type FieldType = 'segment' | 'main_topic' | 'next_action' | 'keywords' | 'summary_text';

export interface UseEditableFieldConfig<T> {
  // 필드 식별
  fieldType: FieldType;
  fieldName?: string; // 한글 필드명 (기본값은 FIELD_NAME_MAP 사용)

  // 잠금 상태 확인
  isLocked: () => boolean;

  // 값 조회
  getOriginalValue: () => T;
  getLiveOverride: () => T | undefined;

  // 업데이트 처리
  handleUpdate: (value: T) => { sent: boolean; truncatedValue?: T };
  setLiveOverride: (value: T) => void;

  // 소켓 상태 전송
  emitStatus: (status: 'start' | 'stop') => void;

  // 편집 상태 setter (외부에서 제공)
  setIsEditing: (value: boolean) => void;
  setEditingValue: (value: T) => void;
  getEditingValue: () => T;
  resetEditingValue?: () => void; // 편집 완료 후 초기화 (optional)

  // 타이머 참조 (외부에서 공유)
  autoRevertTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
  clearTimers: () => void;

  // 비교 함수 (배열 등 복잡한 타입용)
  isEqual?: (a: T, b: T) => boolean;

  // 편집 시작 전 조건 확인 (없으면 편집 불가)
  canEdit?: () => boolean;

  // 편집 시작 직전 훅 — 다른 필드 편집 중이면 먼저 종료(잠금 해제)하는 데 사용
  onBeforeStart?: () => void;
}

export interface UseEditableFieldReturn<T> {
  handleDoubleClick: (initialValue?: T) => void;
  handleFinishEditing: () => void;
  handleTextChange: (newValue: T) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
}

/**
 * 편집 가능한 필드의 공통 로직을 처리하는 hook
 * - 더블클릭으로 편집 모드 진입
 * - 텍스트 변경 시 자동 저장 타이머 리셋
 * - 편집 완료 시 유효성 검사 및 저장
 */
export function useEditableField<T>({
  fieldType,
  fieldName,
  isLocked,
  getOriginalValue,
  getLiveOverride,
  handleUpdate,
  setLiveOverride,
  emitStatus,
  setIsEditing,
  setEditingValue,
  getEditingValue,
  resetEditingValue,
  autoRevertTimerRef,
  clearTimers,
  isEqual = (a, b) => a === b,
  canEdit = () => true,
  onBeforeStart,
}: UseEditableFieldConfig<T>): UseEditableFieldReturn<T> {
  const displayName = fieldName ?? FIELD_NAME_MAP[fieldType] ?? fieldType;

  // 내부 ref로 handleFinishEditing 순환 참조 방지
  const finishEditingRef = useRef<() => void>(() => {});
  // 편집 시작 시간 기록 (최대 편집 시간 제한용)
  const editStartTimeRef = useRef<number | null>(null);

  // --- 편집 완료 핸들러 ---
  const handleFinishEditing = useCallback(() => {
    clearTimers();

    // 편집 조건이 충족되지 않으면 조기 반환 (기존 로직의 if (!note?.summary) return; 대응)
    if (!canEdit()) {
      setIsEditing(false);
      resetEditingValue?.();
      return;
    }

    const editingValue = getEditingValue();
    const override = getLiveOverride();
    const original = getOriginalValue();
    const compareValue = override !== undefined ? override : original;

    // 변경 여부 확인
    if (!isEqual(compareValue, editingValue)) {
      const result = handleUpdate(editingValue);

      // truncated 시 잘린 값을 input에 반영하고 편집 모드 유지
      if (result.truncatedValue !== undefined) {
        setEditingValue(result.truncatedValue);
        return; // 편집 모드 유지
      }

      // 전송 성공 시 liveOverrides에 저장
      if (result.sent) {
        setLiveOverride(editingValue);
      }
    }

    emitStatus('stop');
    editStartTimeRef.current = null; // 편집 시작 시간 초기화
    setIsEditing(false);
    resetEditingValue?.();
  }, [
    clearTimers,
    canEdit,
    getEditingValue,
    getLiveOverride,
    getOriginalValue,
    isEqual,
    handleUpdate,
    setEditingValue,
    setLiveOverride,
    emitStatus,
    setIsEditing,
    resetEditingValue,
  ]);

  // finishEditingRef 업데이트
  finishEditingRef.current = handleFinishEditing;

  // --- 더블클릭 핸들러 ---
  const handleDoubleClick = useCallback((initialValue?: T) => {
    // Lock 체크
    if (isLocked()) {
      toast.info(`${displayName}은(는) 다른 곳에서 수정 중입니다.`);
      return;
    }

    // 편집 가능 여부 확인
    if (!canEdit()) {
      return;
    }

    onBeforeStart?.(); // 다른 필드 편집 중이면 먼저 종료(잠금 해제)
    clearTimers();
    editStartTimeRef.current = Date.now(); // 편집 시작 시간 기록
    setIsEditing(true);

    // liveOverrides에 있으면 그 값 사용, 없으면 원본 또는 전달된 초기값 사용
    const override = getLiveOverride();
    // initialValue가 이벤트 객체인 경우 무시 (DOM onDoubleClick에서 MouseEvent가 전달될 수 있음)
    const isEventObject = initialValue !== undefined &&
      typeof initialValue === 'object' &&
      initialValue !== null &&
      'target' in (initialValue as object);
    const textToEdit = override !== undefined
      ? override
      : (isEventObject ? getOriginalValue() : (initialValue ?? getOriginalValue()));
    setEditingValue(textToEdit);

    emitStatus('start');

    // 자동 저장 타이머 설정
    autoRevertTimerRef.current = setTimeout(() => {
      finishEditingRef.current();
    }, AUTO_REVERT_TIMEOUT_MS);
  }, [
    isLocked,
    canEdit,
    displayName,
    clearTimers,
    setIsEditing,
    getLiveOverride,
    getOriginalValue,
    setEditingValue,
    emitStatus,
    autoRevertTimerRef,
    onBeforeStart,
  ]);

  // --- 텍스트 변경 핸들러 ---
  const handleTextChange = useCallback((newValue: T) => {
    setEditingValue(newValue);
    clearTimers();

    // 최대 편집 시간 체크 - 연속 타이핑해도 5분 후 강제 저장
    const elapsed = editStartTimeRef.current ? Date.now() - editStartTimeRef.current : 0;
    if (elapsed >= MAX_EDIT_DURATION_MS) {
      finishEditingRef.current();
      return;
    }

    // 남은 시간과 AUTO_SAVE_TIMEOUT 중 작은 값 사용
    const remainingTime = MAX_EDIT_DURATION_MS - elapsed;
    const timeout = Math.min(AUTO_REVERT_TIMEOUT_MS, remainingTime);

    autoRevertTimerRef.current = setTimeout(() => {
      finishEditingRef.current();
    }, timeout);
  }, [setEditingValue, clearTimers, autoRevertTimerRef]);

  // --- 키보드 핸들러 (Enter로 편집 완료) ---
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.ctrlKey) {
      event.preventDefault();
      finishEditingRef.current();
    }
  }, []);

  return {
    handleDoubleClick,
    handleFinishEditing,
    handleTextChange,
    handleKeyDown,
  };
}
