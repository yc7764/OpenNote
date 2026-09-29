/**
 * Validation Utilities (길이 검증 전용)
 * 백엔드와 동일한 길이 제한을 적용한다.
 *
 * NOTE(H-1): 과거 이곳에서 HTML 엔티티 이스케이프(& → &amp; 등)를 수행했으나,
 * 렌더링은 전부 React 텍스트 노드(dangerouslySetInnerHTML 미사용)라 표시 시점에
 * 자동 이스케이프된다. 저장 전에 또 이스케이프하면 sttEdit의 동일 처리와 겹쳐
 * 편집할수록 &amp;amp; → &amp;amp;amp;amp; 로 본문이 지수적으로 손상됐다.
 * 그래서 이스케이프를 제거하고 길이 검증만 남긴다. XSS 방어는 렌더 계층이 담당한다.
 */

// 백엔드와 동일한 길이 제한
export const ValidationLimits = {
  SEGMENT_TEXT_MAX_LENGTH: 2000,
  SUMMARY_TITLE_MAX_LENGTH: 200,
  SUMMARY_CONTENT_MAX_LENGTH: 1000,
  KEYWORDS_MAX_COUNT: 10,
  KEYWORD_MAX_LENGTH: 50,
  NEXT_ACTION_MAX_LENGTH: 1000,
  MAIN_TOPIC_MAX_LENGTH: 800,
} as const;

// 검증 + sanitize 통합 함수
export interface ValidationResult {
  success: boolean;
  error?: string;
  sanitized?: string;
  truncated?: boolean;
  truncatedMessage?: string;
}

export interface ArrayValidationResult {
  success: boolean;
  error?: string;
  sanitized?: string[];
  truncated?: boolean;
  truncatedMessage?: string;
}

/**
 * 문자열 검증 (길이 전용)
 * 빈 값 거부 + 글자수 초과 시 잘라내고 truncated: true 반환.
 * 이스케이프는 하지 않는다(H-1) — 값은 원본 그대로 저장하고 렌더 계층이 이스케이프한다.
 */
export function validateAndSanitize(
  value: string,
  maxLength: number,
  fieldName: string
): ValidationResult {
  if (typeof value !== 'string') {
    return { success: false, error: `${fieldName}은(는) 문자열이어야 합니다.` };
  }
  if (value.trim().length === 0) {
    return { success: false, error: `${fieldName}을(를) 입력해주세요.` };
  }

  let sanitizedValue = value;
  let truncated = false;

  if (sanitizedValue.length > maxLength) {
    sanitizedValue = sanitizedValue.slice(0, maxLength);
    truncated = true;
  }

  return {
    success: true,
    sanitized: sanitizedValue,
    truncated,
    truncatedMessage: truncated ? `글자수는 ${maxLength}자를 초과할 수 없습니다.` : undefined
  };
}

/**
 * 문자열 배열 검증 (길이 전용)
 * 개수/글자수 초과 시 잘라내고 truncated: true 반환.
 * 이스케이프는 하지 않는다(H-1) — 렌더 계층이 이스케이프를 담당한다.
 */
export function validateAndSanitizeArray(
  arr: string[],
  maxCount: number,
  maxItemLength: number,
  fieldName: string
): ArrayValidationResult {
  if (!Array.isArray(arr)) {
    return { success: false, error: `${fieldName}은(는) 배열이어야 합니다.` };
  }

  const truncatedReasons: string[] = [];
  let processedArr = arr;

  // 개수 초과 시 자르기
  if (arr.length > maxCount) {
    processedArr = arr.slice(0, maxCount);
    truncatedReasons.push(`${fieldName}은(는) 최대 ${maxCount}개까지 가능합니다.`);
  }

  // 각 항목 검증: XSS sanitize 먼저 → 길이 체크
  const sanitizedItems: string[] = [];
  for (const item of processedArr) {
    if (typeof item !== 'string') {
      return { success: false, error: `${fieldName}의 각 항목은 문자열이어야 합니다.` };
    }

    let sanitizedItem = item;

    if (sanitizedItem.length > maxItemLength) {
      sanitizedItem = sanitizedItem.slice(0, maxItemLength);
      truncatedReasons.push(`각 ${fieldName}은(는) ${maxItemLength}자를 초과할 수 없습니다.`);
    }
    sanitizedItems.push(sanitizedItem);
  }

  const truncated = truncatedReasons.length > 0;
  return {
    success: true,
    sanitized: sanitizedItems,
    truncated,
    truncatedMessage: truncated ? [...new Set(truncatedReasons)].join(', ') : undefined
  };
}
