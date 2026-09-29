import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * 위험한 URL 스킴 패턴
 * 추가된 스킴: blob, filesystem, about
 */
const DANGEROUS_URL_SCHEMES = /^(javascript|vbscript|data|file|blob|filesystem|about):/i;

/**
 * Unicode 앵글 브래킷 및 특수 문자 정규화
 * - 전각 앵글 브래킷
 * - 수학 기호
 * - 기타 유사 문자
 */
const UNICODE_ANGLE_BRACKETS: Record<string, string> = {
  '\uFF1C': '<', // ＜ FULLWIDTH LESS-THAN SIGN
  '\uFF1E': '>', // ＞ FULLWIDTH GREATER-THAN SIGN
  '\u2329': '<', // 〈 LEFT-POINTING ANGLE BRACKET
  '\u232A': '>', // 〉 RIGHT-POINTING ANGLE BRACKET
  '\u27E8': '<', // ⟨ MATHEMATICAL LEFT ANGLE BRACKET
  '\u27E9': '>', // ⟩ MATHEMATICAL RIGHT ANGLE BRACKET
  '\uFE64': '<', // ﹤ SMALL LESS-THAN SIGN
  '\uFE65': '>', // ﹥ SMALL GREATER-THAN SIGN
  '\u3008': '<', // 〈 LEFT ANGLE BRACKET
  '\u3009': '>', // 〉 RIGHT ANGLE BRACKET
};

/**
 * Null 바이트 및 제어 문자 제거
 */
function removeControlChars(value: string): string {
  // Null 바이트, 제어 문자 (0x00-0x1F), DEL (0x7F) 제거
  // 줄바꿈(\n, 0x0A), 캐리지 리턴(\r, 0x0D), 탭(\t, 0x09)은 허용
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Unicode 앵글 브래킷 정규화
 */
function normalizeUnicodeAngles(value: string): string {
  let result = value;
  for (const [unicode, replacement] of Object.entries(UNICODE_ANGLE_BRACKETS)) {
    result = result.split(unicode).join(replacement);
  }
  return result;
}

/**
 * 위험한 URL 스킴 무효화
 */
function sanitizeUrlSchemes(value: string): string {
  // javascript:, vbscript:, data:, file:, blob:, filesystem:, about: 스킴을 무효화
  return value.replace(DANGEROUS_URL_SCHEMES, 'x-blocked:');
}

/**
 * URL 디코딩 (이중 인코딩 공격 방지)
 * 최대 2회까지 디코딩 시도
 */
function decodeUrlSafely(value: string): string {
  let decoded = value;
  let previousValue = '';
  let attempts = 0;
  const maxAttempts = 2;

  // 디코딩이 더 이상 변화가 없거나 최대 시도 횟수에 도달할 때까지 반복
  while (decoded !== previousValue && attempts < maxAttempts) {
    previousValue = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch (e) {
      // 디코딩 실패 시 이전 값 반환
      break;
    }
    attempts++;
  }

  return decoded;
}

/**
 * XSS Sanitizer - 저장 전 정규화 방어
 *
 * NOTE(H-1): 과거 마지막 단계에서 HTML 엔티티 이스케이프(& → &amp; 등)를 수행했으나,
 * 프론트도 동일 처리를 해 편집할수록 본문이 지수적으로 손상됐다(&amp;amp; →
 * &amp;amp;amp;amp;). 렌더링은 전부 React 텍스트 노드라 표시 시점에 자동
 * 이스케이프되므로 저장 전 엔티티 이스케이프는 불필요하며 손상만 유발한다.
 * 이스케이프 단계를 제거하고, 손상을 일으키지 않는 정규화 방어만 남긴다.
 *
 * 처리 순서:
 * 1. URL 디코딩 (이중 인코딩 공격 방지)
 * 2. Null 바이트 및 제어 문자 제거
 * 3. Unicode 앵글 브래킷 정규화
 * 4. 위험한 URL 스킴 무효화
 */
export function sanitizeXss(value: string): string {
  if (typeof value !== 'string') return value;

  let sanitized = value;

  // 1. URL 디코딩 (이중 인코딩 공격 방지)
  sanitized = decodeUrlSafely(sanitized);

  // 2. 제어 문자 제거
  sanitized = removeControlChars(sanitized);

  // 3. Unicode 앵글 브래킷 정규화
  sanitized = normalizeUnicodeAngles(sanitized);

  // 4. 위험한 URL 스킴 무효화
  sanitized = sanitizeUrlSchemes(sanitized);

  return sanitized;
}

/**
 * XSS 시도 탐지 (보안 로깅용)
 *
 * "sanitize로 값이 바뀌었는가"를 신호로 쓰면 일반 텍스트(URL·"a & b"·"x=y")가
 * 전부 오탐되므로, 실제 주입 신호 — 앵글 브래킷, 위험 URL 스킴 — 만 판정한다.
 * sanitizeXss와 동일한 전처리(URL 디코딩·제어문자 제거·유니코드 앵글 정규화)를 거쳐
 * 이중 인코딩/전각 문자 우회도 함께 잡는다.
 */
export function detectXssAttempt(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  let v = decodeUrlSafely(value);
  v = removeControlChars(v);
  v = normalizeUnicodeAngles(v);
  return /[<>]/.test(v) || DANGEROUS_URL_SCHEMES.test(v);
}

/**
 * 배열 내 문자열들을 sanitize
 */
export function sanitizeStringArray(arr: any[]): string[] {
  if (!Array.isArray(arr)) return arr;
  return arr
    .filter((item) => typeof item === 'string')
    .map((item) => sanitizeXss(item))
    .filter((item) => item.length > 0);
}

/**
 * 검증 상수 (길이 제한)
 */
export const ValidationLimits = {
  NOTE_ID_MAX_LENGTH: 20,
  SEGMENT_ID_MAX_LENGTH: 50,
  SECTION_ID_MAX_LENGTH: 50,
  UPDATED_BY_MAX_LENGTH: 50,
  // TOKEN_MAX_LENGTH 제거 - HttpOnly 쿠키에서 추출하므로 필요 없음
  SEGMENT_TEXT_MAX_LENGTH: 2000,
  SUMMARY_TITLE_MAX_LENGTH: 200,
  SUMMARY_CONTENT_MAX_LENGTH: 1000,
  KEYWORDS_MAX_COUNT: 10,
  KEYWORD_MAX_LENGTH: 50,
  NEXT_ACTION_MAX_LENGTH: 1000,
  MAIN_TOPIC_MAX_LENGTH: 800,
} as const;

/**
 * 유효한 type 값 목록
 */
export const VALID_NOTE_TYPES = ['segment', 'summary_text', 'keywords', 'next_action', 'main_topic'] as const;
export type NoteDataType = (typeof VALID_NOTE_TYPES)[number];

// ─────────────────────────────────────────────────────────────
// Payload DTOs
// ─────────────────────────────────────────────────────────────

/**
 * SummaryText payload DTO
 */
export class SummaryTextPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ValidationLimits.SUMMARY_TITLE_MAX_LENGTH)
  @Transform(({ value }) => sanitizeXss(value))
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(ValidationLimits.SUMMARY_CONTENT_MAX_LENGTH)
  @Transform(({ value }) => sanitizeXss(value))
  content: string;
}

// ─────────────────────────────────────────────────────────────
// Main DTO
// ─────────────────────────────────────────────────────────────

/**
 * UpdateNoteData DTO
 */
export class UpdateNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ValidationLimits.NOTE_ID_MAX_LENGTH)
  noteId: string;

  // segmentId/sectionId는 Redis 키(note:{noteId}:segment:{id})와 스케줄러의
  // key.split(':') 파싱에 그대로 쓰인다. 콜론 등이 섞이면 keyParts 인덱스가
  // 밀려 엉뚱한 세그먼트/섹션에 기록되므로(무결성 손상) 숫자만 허용한다.
  @IsString()
  @IsOptional()
  @MaxLength(ValidationLimits.SEGMENT_ID_MAX_LENGTH)
  @Matches(/^\d+$/, { message: 'segmentId must contain digits only' })
  segmentId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(ValidationLimits.SECTION_ID_MAX_LENGTH)
  @Matches(/^\d+$/, { message: 'sectionId must contain digits only' })
  sectionId?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_NOTE_TYPES)
  type: NoteDataType;

  @IsNotEmpty()
  payload: any; // 타입별로 별도 검증

  @IsNumber()
  @IsOptional()
  timestamp?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(ValidationLimits.UPDATED_BY_MAX_LENGTH)
  updatedBy: string;

  // token 필드 제거 - HttpOnly 쿠키에서 추출 (XSS 방어)
}
