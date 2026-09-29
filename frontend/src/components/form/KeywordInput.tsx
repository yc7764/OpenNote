"use client";
import { useState, useRef, KeyboardEvent } from 'react';

type Props = {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  maxKeywords?: number;
  placeholder?: string;
};

export default function KeywordInput({
  keywords,
  onChange,
  maxKeywords = 10,
  placeholder = '키워드 입력 후 Enter',
}: Props) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addKeyword = (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    if (keywords.length >= maxKeywords) return;
    if (keywords.includes(trimmed)) return;
    onChange([...keywords, trimmed]);
    setInputValue('');
  };

  const removeKeyword = (indexToRemove: number) => {
    onChange(keywords.filter((_, index) => index !== indexToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && keywords.length > 0) {
      removeKeyword(keywords.length - 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // 콤마가 포함되어 있으면 분리하여 추가
    if (value.includes(',')) {
      const parts = value.split(',');
      parts.forEach((part, idx) => {
        if (idx < parts.length - 1) {
          addKeyword(part);
        } else {
          setInputValue(part);
        }
      });
    } else {
      setInputValue(value);
    }
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div>
      <div
        onClick={handleContainerClick}
        className="flex flex-wrap gap-2 p-3 min-h-[48px] border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 cursor-text focus-within:ring-2 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 focus-within:border-transparent transition-all"
      >
        {keywords.map((keyword, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-md text-sm font-medium"
          >
            {keyword}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeKeyword(index);
              }}
              className="ml-0.5 p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
              aria-label={`${keyword} 삭제`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        {keywords.length < maxKeywords && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={keywords.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
          />
        )}
      </div>
      <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        Enter 또는 콤마(,)로 키워드 추가 · 최대 {maxKeywords}개
      </p>
    </div>
  );
}
