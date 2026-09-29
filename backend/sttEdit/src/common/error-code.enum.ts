export enum ErrorCode {
  NETWORK_ERROR = 'E10100',
  REDIS_SAVE_FAILURE = 'E20100',
  REDIS_PUBSUB_FAILURE = 'E20200',
  REDIS_CONNECTION_FAILURE = 'E20300',
  REDIS_TIMEOUT = 'E20400',
  DB_UPDATE_FAILURE = 'E30100',
  DB_CONNECTION_FAILURE = 'E30200',
  DB_TRANSACTION_FAILURE = 'E30300',
  INVALID_JWT_TOKEN = 'E40100',
  INVALID_JWT_EXPIRED = 'E40101',
  AUTH_MISSING_TOKEN = 'E40200',
  AUTH_MISSING_NOTEID = 'E40201',
  JWT_USER_MISMATCH = 'E40202',
  INVALID_NOTEID_FORMAT = 'E40203',
  INITIAL_DATA_FETCH_FAILURE = 'E50100',
  UNAUTHORIZED_NOTE_ACCESS = 'E50200',
  NOTE_DELETED = 'E50201',

  // Data Validation Errors
  INVALID_DATA_TYPE = 'E60100',
  INVALID_DATA_LENGTH = 'E60101',
  MISSING_REQUIRED_FIELD = 'E60102',
  INVALID_PAYLOAD_STRUCTURE = 'E60103',
  XSS_DETECTED = 'E60104',

  // Rate Limiting Errors
  RATE_LIMIT_EXCEEDED = 'E70100',

  // Connection Errors
  CONNECTION_LIMIT_EXCEEDED = 'E80100',
  SESSION_EXPIRED = 'E80200',

  // Retry Errors
  MAX_RETRY_EXCEEDED = 'E90100',
}

/**
 * 에러 코드별 메시지 맵
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: '네트워크 에러가 발생했습니다.',
  [ErrorCode.REDIS_SAVE_FAILURE]: '저장에 실패하였습니다.',
  [ErrorCode.REDIS_PUBSUB_FAILURE]: '처리에 실패하였습니다.',
  [ErrorCode.REDIS_CONNECTION_FAILURE]: 'Redis 연결에 실패하였습니다.',
  [ErrorCode.REDIS_TIMEOUT]: 'Redis 요청 시간이 초과되었습니다.',
  [ErrorCode.DB_UPDATE_FAILURE]: '업데이트에 실패하였습니다.',
  [ErrorCode.DB_CONNECTION_FAILURE]: '데이터베이스 연결에 실패하였습니다.',
  [ErrorCode.DB_TRANSACTION_FAILURE]: '트랜잭션 처리에 실패하였습니다.',
  [ErrorCode.INVALID_JWT_TOKEN]: '유효하지 않은 토큰입니다.',
  [ErrorCode.INVALID_JWT_EXPIRED]: '토큰이 만료되었습니다.',
  [ErrorCode.AUTH_MISSING_TOKEN]: '토큰이 존재하지 않습니다.',
  [ErrorCode.AUTH_MISSING_NOTEID]: 'noteId가 존재하지 않습니다.',
  [ErrorCode.JWT_USER_MISMATCH]: '유효하지 않은 토큰입니다.',
  [ErrorCode.INVALID_NOTEID_FORMAT]: 'noteId 형식이 올바르지 않습니다.',
  [ErrorCode.INITIAL_DATA_FETCH_FAILURE]: '데이터 조회에 실패하였습니다.',
  [ErrorCode.UNAUTHORIZED_NOTE_ACCESS]: 'note에 대한 권한 없습니다.',
  [ErrorCode.NOTE_DELETED]: '휴지통에 있는 노트는 편집할 수 없습니다. 복원 후 이용해주세요.',
  [ErrorCode.INVALID_DATA_TYPE]: '잘못된 데이터 타입입니다.',
  [ErrorCode.INVALID_DATA_LENGTH]: '데이터 길이가 초과되었습니다.',
  [ErrorCode.MISSING_REQUIRED_FIELD]: '필수 필드가 누락되었습니다.',
  [ErrorCode.INVALID_PAYLOAD_STRUCTURE]: 'payload 구조가 일치하지 않습니다.',
  [ErrorCode.XSS_DETECTED]: 'XSS 공격 패턴 감지',
  [ErrorCode.RATE_LIMIT_EXCEEDED]: '요청 빈도를 초과하였습니다. %s초 후에 다시 시도해주세요.',
  [ErrorCode.CONNECTION_LIMIT_EXCEEDED]: '다른 기기에서 접속하여 연결이 종료되었습니다.',
  [ErrorCode.SESSION_EXPIRED]: '세션이 만료되었습니다. 다시 로그인을 해주세요.',
  [ErrorCode.MAX_RETRY_EXCEEDED]: '최대 재시도 횟수를 초과하였습니다.',
};

/**
 * 에러 코드로 메시지 조회
 */
export function getErrorMessage(code: ErrorCode): string {
  return ErrorMessages[code] ?? '알 수 없는 에러가 발생하였습니다.';
}