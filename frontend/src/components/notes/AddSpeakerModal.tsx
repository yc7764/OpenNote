'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AddSpeakerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  disabled?: boolean;
}

const MAX_SPEAKER_NAME_LENGTH = 100;

/**
 * 화자 추가 인라인 폼 컴포넌트
 * 화자 관리 영역 내에서 새 화자를 추가할 수 있는 입력 폼
 */
function AddSpeakerModal({
  isOpen,
  onClose,
  onSubmit,
  disabled = false,
}: AddSpeakerModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 모달이 열릴 때 input에 포커스
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setError(null);
    }
  }, [isOpen]);

  // 입력 값 검증
  const validateName = useCallback((value: string): string | null => {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return '화자 이름을 입력해주세요.';
    }

    if (trimmed.length > MAX_SPEAKER_NAME_LENGTH) {
      return `화자 이름은 ${MAX_SPEAKER_NAME_LENGTH}자 이하로 입력해주세요.`;
    }

    return null;
  }, []);

  // 입력 변경 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // 100자 제한
    if (value.length > MAX_SPEAKER_NAME_LENGTH) {
      return;
    }

    setName(value);

    // 에러 상태 초기화
    if (error) {
      setError(null);
    }
  };

  // 제출 핸들러
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    const validationError = validateName(name);
    if (validationError) {
      setError(validationError);
      inputRef.current?.focus();
      return;
    }

    onSubmit(name.trim());
    setName('');
    setError(null);
    onClose();
  };

  // ESC 키로 닫기
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 animate-in slide-in-from-top-2 duration-200">
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex flex-col gap-3">
          {/* 라벨 */}
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            <svg
              className="w-4 h-4 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            새 화자 추가
          </label>

          {/* 입력 필드 */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="화자 이름을 입력하세요"
                disabled={disabled}
                maxLength={MAX_SPEAKER_NAME_LENGTH}
                className={`
                  w-full px-3 py-2 text-sm
                  bg-white dark:bg-neutral-800
                  border rounded-lg
                  placeholder-neutral-400 dark:placeholder-neutral-500
                  text-neutral-900 dark:text-neutral-100
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors
                  ${error
                    ? 'border-red-300 dark:border-red-600'
                    : 'border-neutral-300 dark:border-neutral-600'
                  }
                `}
              />
              {/* 에러 메시지 */}
              {error && (
                <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {error}
                </p>
              )}
            </div>

            {/* 버튼 그룹 */}
            <div className="flex gap-2 sm:flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={disabled}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium
                         text-neutral-600 dark:text-neutral-400
                         bg-neutral-100 dark:bg-neutral-700
                         hover:bg-neutral-200 dark:hover:bg-neutral-600
                         rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-2 focus:ring-neutral-500"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={disabled || name.trim().length === 0 || !!error}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium
                         text-white
                         bg-blue-600 hover:bg-blue-700
                         dark:bg-blue-500 dark:hover:bg-blue-600
                         rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                추가
              </button>
            </div>
          </div>

          {/* 글자 수 표시 */}
          <div className="flex justify-end">
            <span className={`text-xs ${
              name.length > MAX_SPEAKER_NAME_LENGTH * 0.9
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-neutral-400 dark:text-neutral-500'
            }`}>
              {name.length}/{MAX_SPEAKER_NAME_LENGTH}
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}

export default AddSpeakerModal;
