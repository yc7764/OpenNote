import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { ErrorCode } from '../common/error-code.enum';
import {
  UpdateNoteDto,
  ValidationLimits,
  sanitizeXss,
  sanitizeStringArray,
  detectXssAttempt,
  NoteDataType,
  SummaryTextPayloadDto,
} from './dto/update-note.dto';

/**
 * SetSpeaker 타입 정의
 * - add: 화자 추가 (기존 temp)
 * - segment: segment별 화자 변경
 * - merge: 화자 병합 (sourceId -> targetId)
 */
export const VALID_SET_SPEAKER_TYPES = ['add', 'segment', 'merge', 'alias'] as const;
export type SetSpeakerType = (typeof VALID_SET_SPEAKER_TYPES)[number];

/**
 * SetSpeaker DTO (화자 관리용)
 */
export interface SetSpeakerDto {
  noteId: string;
  type: SetSpeakerType;
  payload: any;  // type에 따라 형식이 다름
  segmentId?: string;
  timestamp?: number;
  updatedBy: string;
}

/**
 * SetSpeaker 검증 상수
 */
export const SetSpeakerLimits = {
  SPEAKER_NAME_MAX_LENGTH: 100,
  MAX_PAYLOAD_ENTRIES: 1000,      // segment/merge/alias 최대 항목 수
  MAX_PAYLOAD_SIZE_BYTES: 102400, // payload 최대 크기 (100KB)
} as const;

/**
 * XSS 시도 탐지 결과 (보안 로깅용) — original은 핸들러에서 해시로만 기록된다.
 */
export interface XssDetection {
  field: string;
  original: string;
}

/**
 * 데이터 검증 결과 (제네릭으로 통합)
 */
export interface DataValidationResult<T = UpdateNoteDto> {
  success: boolean;
  errorCode?: ErrorCode;
  message?: string;
  sanitizedData?: T;
  /** sanitize 과정에서 실제 주입 신호(앵글 브래킷·위험 스킴)가 잡힌 필드들 */
  xssDetections?: XssDetection[];
}

/**
 * ValidationError를 읽기 쉬운 메시지로 변환
 */
function formatValidationErrors(errors: ValidationError[]): string {
  const messages: string[] = [];

  function extractMessages(errs: ValidationError[], prefix = ''): void {
    for (const error of errs) {
      const propPath = prefix ? `${prefix}.${error.property}` : error.property;
      if (error.constraints) {
        messages.push(`${propPath}: ${Object.values(error.constraints).join(', ')}`);
      }
      if (error.children && error.children.length > 0) {
        extractMessages(error.children, propPath);
      }
    }
  }

  extractMessages(errors);
  return messages.join('; ');
}

/**
 * type에 따른 필수 ID 검증
 */
function validateRequiredIdByType(
  type: NoteDataType,
  segmentId?: string,
  sectionId?: string,
): DataValidationResult {
  if (type === 'segment' && !segmentId) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'segmentId is required for segment type',
    };
  }

  if (type === 'summary_text' && !sectionId) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'sectionId is required for summary_text type',
    };
  }

  return { success: true };
}

/**
 * Payload sanitize 및 검증 (type별 분기)
 * - segment, next_action, main_topic: 문자열 sanitize
 * - summary_text: SummaryTextPayloadDto 사용
 * - keywords: KeywordsPayloadDto 사용
 */
function sanitizeAndValidatePayload(
  type: NoteDataType,
  payload: any,
): DataValidationResult & { sanitizedPayload?: any } {
  switch (type) {
    case 'segment':
      return sanitizeStringPayload(payload, 'segment', ValidationLimits.SEGMENT_TEXT_MAX_LENGTH);
    case 'summary_text':
      return validateSummaryTextPayload(payload);
    case 'keywords':
      return validateKeywordsPayload(payload);
    case 'next_action':
      return sanitizeStringPayload(payload, 'next_action', ValidationLimits.NEXT_ACTION_MAX_LENGTH);
    case 'main_topic':
      return sanitizeStringPayload(payload, 'main_topic', ValidationLimits.MAIN_TOPIC_MAX_LENGTH);
    default:
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `Unknown type: ${type}`,
      };
  }
}

/**
 * 문자열 payload sanitize (segment, next_action, main_topic)
 */
function sanitizeStringPayload(
  payload: any,
  typeName: string,
  maxLength: number,
): DataValidationResult & { sanitizedPayload?: string } {
  if (typeof payload !== 'string') {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: `${typeName} payload must be a string`,
    };
  }

  const sanitized = sanitizeXss(payload);

  if (sanitized.length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: `${typeName} payload cannot be empty`,
    };
  }

  if (sanitized.length > maxLength) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_LENGTH,
      message: `${typeName} payload exceeds maximum length of ${maxLength}`,
    };
  }

  const xssDetections = detectXssAttempt(payload)
    ? [{ field: `payload.${typeName}`, original: payload }]
    : undefined;

  return { success: true, sanitizedPayload: sanitized, xssDetections };
}

/**
 * SummaryText payload 검증 (DTO 사용)
 */
function validateSummaryTextPayload(
  payload: any,
): DataValidationResult & { sanitizedPayload?: { title: string; content: string } } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_PAYLOAD_STRUCTURE,
      message: 'summary_text payload must be an object with title and content',
    };
  }

  // DTO로 변환 및 검증
  const dto = plainToInstance(SummaryTextPayloadDto, payload);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: false,
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: `summary_text payload: ${formatValidationErrors(errors)}`,
    };
  }

  if (!dto.title || dto.title.length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'summary_text payload.title cannot be empty',
    };
  }

  if (!dto.content || dto.content.length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'summary_text payload.content cannot be empty',
    };
  }

  const xssDetections: XssDetection[] = [];
  if (detectXssAttempt(payload.title)) {
    xssDetections.push({ field: 'payload.title', original: payload.title });
  }
  if (detectXssAttempt(payload.content)) {
    xssDetections.push({ field: 'payload.content', original: payload.content });
  }

  return {
    success: true,
    sanitizedPayload: { title: dto.title, content: dto.content },
    xssDetections: xssDetections.length > 0 ? xssDetections : undefined,
  };
}

/**
 * Keywords payload 검증 (배열 직접 sanitize)
 */
function validateKeywordsPayload(
  payload: any,
): DataValidationResult & { sanitizedPayload?: string[] } {
  if (!Array.isArray(payload)) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_PAYLOAD_STRUCTURE,
      message: 'keywords payload must be an array of strings',
    };
  }

  // 배열 길이 체크
  if (payload.length > ValidationLimits.KEYWORDS_MAX_COUNT) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_LENGTH,
      message: `keywords count exceeds maximum of ${ValidationLimits.KEYWORDS_MAX_COUNT}`,
    };
  }

  // 각 요소 타입 체크
  for (let i = 0; i < payload.length; i++) {
    if (typeof payload[i] !== 'string') {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `keywords[${i}] must be a string`,
      };
    }
  }

  // sanitize
  const sanitized = sanitizeStringArray(payload);

  // sanitize 후 빈 배열 체크는 하지 않음 (빈 키워드는 제거됨)

  // 각 요소 길이 체크
  for (let i = 0; i < sanitized.length; i++) {
    if (sanitized[i].length > ValidationLimits.KEYWORD_MAX_LENGTH) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_LENGTH,
        message: `keywords[${i}] exceeds maximum length of ${ValidationLimits.KEYWORD_MAX_LENGTH}`,
      };
    }
  }

  // 원본 배열 기준으로 주입 신호 탐지 (sanitizeStringArray는 빈 항목을 걸러
  // 인덱스가 어긋날 수 있어 원본 payload를 그대로 검사한다)
  const xssDetections: XssDetection[] = [];
  payload.forEach((kw, i) => {
    if (detectXssAttempt(kw)) {
      xssDetections.push({ field: `payload.keywords[${i}]`, original: kw });
    }
  });

  return {
    success: true,
    sanitizedPayload: sanitized,
    xssDetections: xssDetections.length > 0 ? xssDetections : undefined,
  };
}

/**
 * UpdateNoteData 전체 검증 (메인 함수)
 * - class-validator로 기본 필드 검증
 * - payload는 type별로 sanitize 후 검증
 * - sanitize된 데이터 반환
 */
export function validateUpdateNoteData(data: any): DataValidationResult {
  // 1. class-validator로 기본 필드 검증
  const dto = plainToInstance(UpdateNoteDto, data);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: false,
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: formatValidationErrors(errors),
    };
  }

  // 2. type에 따른 필수 ID 검증
  const idValidation = validateRequiredIdByType(dto.type, dto.segmentId, dto.sectionId);
  if (!idValidation.success) return idValidation;

  // 3. payload sanitize 및 검증
  if (dto.payload === undefined || dto.payload === null) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'payload is required',
    };
  }

  const payloadResult = sanitizeAndValidatePayload(dto.type, dto.payload);
  if (!payloadResult.success) return payloadResult;

  // 4. sanitize된 payload로 교체
  dto.payload = payloadResult.sanitizedPayload;

  return {
    success: true,
    sanitizedData: dto,
    xssDetections: payloadResult.xssDetections,
  };
}

// ─────────────────────────────────────────────────────────────
// SetSpeaker 검증 함수
// ─────────────────────────────────────────────────────────────

/**
 * Payload 검증 결과
 */
interface PayloadValidationResult {
  success: boolean;
  errorCode?: ErrorCode;
  message?: string;
  sanitizedPayload?: any;
  xssDetections?: XssDetection[];
}

/**
 * SetSpeaker payload 검증 (type별 분기)
 * - add: 화자 추가 { speakerId, name }
 * - segment: segment별 화자 변경 { [segmentId]: speakerId }
 */
function sanitizeAndValidateSetSpeakerPayload(
  type: SetSpeakerType,
  payload: any,
): PayloadValidationResult {
  switch (type) {
    case 'add':
      return validateAddSpeakerPayload(payload);
    case 'segment':
      return validateSegmentSpeakerPayload(payload);
    case 'merge':
      return validateMergeSpeakerPayload(payload);
    case 'alias':
      return validateAliasSpeakerPayload(payload);
    default:
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `Unknown setSpeaker type: ${type}`,
      };
  }
}

/**
 * add 타입 payload 검증 (화자 추가)
 * payload: { speakerId: string, name: string }
 * - speakerId: "sp_0", "sp_1", ... 형식
 * - name: 화자명 (XSS sanitize 적용)
 */
function validateAddSpeakerPayload(payload: any): PayloadValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: 'add payload must be an object with speakerId and name',
    };
  }

  const { speakerId, name } = payload;

  // speakerId 검증: sp_ 접두사 + 숫자
  if (typeof speakerId !== 'string' || !/^sp_\d+$/.test(speakerId)) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: 'speakerId must be in format "sp_N" (e.g. sp_0, sp_1)',
    };
  }

  // name 검증
  if (typeof name !== 'string') {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: 'name must be a string',
    };
  }

  const sanitizedName = sanitizeXss(name.trim());

  if (sanitizedName.length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'speaker name cannot be empty',
    };
  }

  if (sanitizedName.length > SetSpeakerLimits.SPEAKER_NAME_MAX_LENGTH) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_LENGTH,
      message: `speaker name exceeds maximum length of ${SetSpeakerLimits.SPEAKER_NAME_MAX_LENGTH}`,
    };
  }

  return {
    success: true,
    sanitizedPayload: { speakerId, name: sanitizedName },
    xssDetections: detectXssAttempt(name)
      ? [{ field: 'payload.name', original: name }]
      : undefined,
  };
}

/**
 * segment 타입 payload 검증 (segment별 화자 변경)
 * payload: { [segmentId: string]: speakerId }
 * - segmentId: 숫자 문자열 (예: "1", "2")
 * - speakerId: "sp_0", "sp_1", ... 형식
 */
function validateSegmentSpeakerPayload(payload: any): PayloadValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: 'segment payload must be an object with { segmentId: speakerId }',
    };
  }

  const entries = Object.entries(payload);

  if (entries.length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'segment payload cannot be empty',
    };
  }

  if (entries.length > SetSpeakerLimits.MAX_PAYLOAD_ENTRIES) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_LENGTH,
      message: `segment payload has ${entries.length} entries, maximum is ${SetSpeakerLimits.MAX_PAYLOAD_ENTRIES}`,
    };
  }

  const sanitizedPayload: Record<string, string> = {};

  for (const [segmentId, speakerId] of entries) {
    // segmentId 검증: 숫자 문자열
    if (!/^\d+$/.test(segmentId)) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `segmentId "${segmentId}" must be a numeric string`,
      };
    }

    // speakerId 검증: sp_ 접두사 + 숫자
    if (typeof speakerId !== 'string' || !/^sp_\d+$/.test(speakerId)) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `speakerId for segment ${segmentId} must be in format "sp_N" (e.g. sp_0, sp_1)`,
      };
    }

    sanitizedPayload[segmentId] = speakerId;
  }

  return {
    success: true,
    sanitizedPayload,
  };
}

/**
 * merge 타입 payload 검증 (화자 병합)
 * payload: { [sourceId: string]: targetId }
 * - sourceId: "sp_0", "sp_1", ... 형식 (병합되어 사라질 화자)
 * - targetId: "sp_0", "sp_1", ... 형식 (병합 대상 화자)
 * - sourceId !== targetId (자기 자신에게 병합 불가)
 */
function validateMergeSpeakerPayload(payload: any): PayloadValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: 'merge payload must be an object with { sourceId: targetId }',
    };
  }

  const entries = Object.entries(payload);

  if (entries.length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'merge payload cannot be empty',
    };
  }

  if (entries.length > SetSpeakerLimits.MAX_PAYLOAD_ENTRIES) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_LENGTH,
      message: `merge payload has ${entries.length} entries, maximum is ${SetSpeakerLimits.MAX_PAYLOAD_ENTRIES}`,
    };
  }

  const sanitizedPayload: Record<string, string> = {};

  for (const [sourceId, targetId] of entries) {
    // sourceId 검증: sp_ 접두사 + 숫자
    if (!/^sp_\d+$/.test(sourceId)) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `sourceId "${sourceId}" must be in format "sp_N" (e.g. sp_0, sp_1)`,
      };
    }

    // targetId 검증: sp_ 접두사 + 숫자
    if (typeof targetId !== 'string' || !/^sp_\d+$/.test(targetId)) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `targetId for source ${sourceId} must be in format "sp_N" (e.g. sp_0, sp_1)`,
      };
    }

    // 자기 자신에게 병합 불가
    if (sourceId === targetId) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `Cannot merge speaker "${sourceId}" into itself`,
      };
    }

    sanitizedPayload[sourceId] = targetId;
  }

  return {
    success: true,
    sanitizedPayload,
  };
}

/**
 * alias 타입 payload 검증 (화자명 변경)
 * payload: { [speakerId: string]: newName }
 * - speakerId: "sp_0", "sp_1", ... 형식
 * - newName: 새 화자명 (XSS sanitize 적용, 100자 제한)
 */
function validateAliasSpeakerPayload(payload: any): PayloadValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: 'alias payload must be an object with { speakerId: newName }',
    };
  }

  const entries = Object.entries(payload);

  if (entries.length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'alias payload cannot be empty',
    };
  }

  if (entries.length > SetSpeakerLimits.MAX_PAYLOAD_ENTRIES) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_LENGTH,
      message: `alias payload has ${entries.length} entries, maximum is ${SetSpeakerLimits.MAX_PAYLOAD_ENTRIES}`,
    };
  }

  const sanitizedPayload: Record<string, string> = {};
  const xssDetections: XssDetection[] = [];

  for (const [speakerId, newName] of entries) {
    // speakerId 검증: sp_ 접두사 + 숫자
    if (!/^sp_\d+$/.test(speakerId)) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `speakerId "${speakerId}" must be in format "sp_N" (e.g. sp_0, sp_1)`,
      };
    }

    // newName 검증
    if (typeof newName !== 'string') {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `name for speaker ${speakerId} must be a string`,
      };
    }

    const sanitizedName = sanitizeXss((newName as string).trim());

    if (sanitizedName.length === 0) {
      return {
        success: false,
        errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
        message: `speaker name for ${speakerId} cannot be empty`,
      };
    }

    if (sanitizedName.length > SetSpeakerLimits.SPEAKER_NAME_MAX_LENGTH) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_LENGTH,
        message: `speaker name for ${speakerId} exceeds maximum length of ${SetSpeakerLimits.SPEAKER_NAME_MAX_LENGTH}`,
      };
    }

    if (detectXssAttempt(newName)) {
      xssDetections.push({ field: `payload.${speakerId}`, original: newName as string });
    }

    sanitizedPayload[speakerId] = sanitizedName;
  }

  return {
    success: true,
    sanitizedPayload,
    xssDetections: xssDetections.length > 0 ? xssDetections : undefined,
  };
}

/**
 * SetSpeakerData 검증 (type + payload만)
 * - noteId, updatedBy 등은 websocket.server.ts에서 별도 검증
 */
export function validateSetSpeakerData(data: any): DataValidationResult<SetSpeakerDto> {
  const { type, payload } = data;

  // 1. type 검증
  if (!VALID_SET_SPEAKER_TYPES.includes(type)) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: `type must be one of: ${VALID_SET_SPEAKER_TYPES.join(', ')}`,
    };
  }

  // 2. payload 존재 여부 검증
  if (payload === undefined || payload === null) {
    return {
      success: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      message: 'payload is required',
    };
  }

  // 3. payload 크기 검증 (DoS 방지)
  const payloadSize = JSON.stringify(payload).length;
  if (payloadSize > SetSpeakerLimits.MAX_PAYLOAD_SIZE_BYTES) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_LENGTH,
      message: `payload size (${payloadSize} bytes) exceeds maximum of ${SetSpeakerLimits.MAX_PAYLOAD_SIZE_BYTES} bytes`,
    };
  }

  // 4. payload 검증 (type별 분기)
  const payloadResult = sanitizeAndValidateSetSpeakerPayload(type, payload);
  if (!payloadResult.success) {
    return {
      success: false,
      errorCode: payloadResult.errorCode,
      message: payloadResult.message,
    };
  }

  // 5. 화이트리스트 재조립. 과거엔 ...data로 원본을 통째로 스프레드해, 공격자가
  //    payload 밖에 임의의 대용량 필드를 실으면 위 payload 크기 검증(3단계)을
  //    우회한 채 그대로 룸+Redis pub/sub로 브로드캐스트돼 트래픽이 증폭됐다.
  //    SetSpeakerDto가 선언한 필드만 남기고, 식별자 필드는 짧은 값이므로 길이도
  //    제한해 알려진 필드를 통한 증폭까지 차단한다.
  const ID_FIELD_MAX_LENGTH = 64;
  for (const name of ['noteId', 'segmentId', 'updatedBy'] as const) {
    const val = (data as Record<string, unknown>)[name];
    if (val === undefined) continue;
    if (typeof val !== 'string') {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `${name} must be a string`,
      };
    }
    if (val.length > ID_FIELD_MAX_LENGTH) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_DATA_LENGTH,
        message: `${name} exceeds ${ID_FIELD_MAX_LENGTH} characters`,
      };
    }
  }
  if (data.timestamp !== undefined && typeof data.timestamp !== 'number') {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_DATA_TYPE,
      message: 'timestamp must be a number',
    };
  }

  const sanitizedData: SetSpeakerDto = {
    noteId: data.noteId,
    type,
    payload: payloadResult.sanitizedPayload,
    updatedBy: data.updatedBy,
  };
  if (data.segmentId !== undefined) sanitizedData.segmentId = data.segmentId;
  if (data.timestamp !== undefined) sanitizedData.timestamp = data.timestamp;

  return {
    success: true,
    sanitizedData,
    xssDetections: payloadResult.xssDetections,
  };
}
