import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { securityLogger } from '../../config/winston.config';

/**
 * 보안 이벤트 전용 로거 서비스
 * Django의 security.log 패턴과 동일한 구조로 보안 이벤트를 기록합니다.
 *
 * 기록되는 이벤트:
 * - JWT 검증 실패
 * - Rate limit 초과
 * - 연결 제한 초과
 * - 비인가 노트 접근 시도
 * - 세션 만료
 *
 * 보안 고려사항:
 * - 토큰, 비밀번호 등 민감 데이터는 해시 처리
 * - 공격 페이로드는 서명만 기록 (원본 노출 방지)
 * - 로그 인젝션 방지를 위한 입력 검증
 */

// 문자열 필드 최대 길이
const MAX_STRING_LENGTH = 500;

@Injectable()
export class SecurityLoggerService {
  /**
   * 민감 데이터를 해시로 변환 (SHA-256, 앞 16자만 사용)
   */
  private hashSensitiveData(data: string): string {
    if (!data) return '';
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * 문자열 길이 제한 및 위험 문자 제거
   */
  private sanitizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') {
      return String(value).substring(0, maxLength);
    }
    // 제어 문자 및 줄바꿈 제거 (로그 인젝션 방지)
    // \u2028: Line Separator, \u2029: Paragraph Separator (유니코드 개행)
    return value
      .replace(/[\x00-\x1f\x7f\u2028\u2029]/g, '')
      .substring(0, maxLength);
  }

  /**
   * 숫자 값 검증
   */
  private sanitizeNumber(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  }

  /**
   * JWT 검증 실패 로그
   * 토큰은 해시로만 기록 (원본 노출 방지)
   */
  logJwtValidationFailure(params: {
    ip?: string;
    userId?: number;
    noteId?: string;
    reason: string;
    token?: string;
  }): void {
    securityLogger.warn({
      message: 'JWT validation failed',
      event: 'jwt_validation_failure',
      context: 'Security',
      ip: this.sanitizeString(params.ip),
      userId: this.sanitizeNumber(params.userId),
      noteId: this.sanitizeString(params.noteId),
      reason: this.sanitizeString(params.reason),
      // 토큰은 해시로만 기록 (알고리즘 정보 노출 방지)
      tokenHash: params.token ? this.hashSensitiveData(params.token) : undefined,
    });
  }

  /**
   * Rate limit 초과 로그
   */
  logRateLimitExceeded(params: {
    ip?: string;
    userId?: number;
    noteId?: string;
    limit: number;
    windowMs: number;
    requestCount: number;
  }): void {
    securityLogger.warn({
      message: 'Rate limit exceeded',
      event: 'rate_limit_exceeded',
      context: 'Security',
      ip: this.sanitizeString(params.ip),
      userId: this.sanitizeNumber(params.userId),
      noteId: this.sanitizeString(params.noteId),
      limit: this.sanitizeNumber(params.limit),
      windowMs: this.sanitizeNumber(params.windowMs),
      requestCount: this.sanitizeNumber(params.requestCount),
    });
  }

  /**
   * 연결 제한 초과 로그
   */
  logConnectionLimitExceeded(params: {
    ip?: string;
    userId?: number;
    currentConnections: number;
    maxConnections: number;
  }): void {
    securityLogger.warn({
      message: 'Connection limit exceeded',
      event: 'connection_limit_exceeded',
      context: 'Security',
      ip: this.sanitizeString(params.ip),
      userId: this.sanitizeNumber(params.userId),
      currentConnections: this.sanitizeNumber(params.currentConnections),
      maxConnections: this.sanitizeNumber(params.maxConnections),
    });
  }

  /**
   * 비인가 노트 접근 시도 로그
   */
  logUnauthorizedNoteAccess(params: {
    ip?: string;
    userId?: number;
    noteId?: string;
    action: string;
    reason: string;
  }): void {
    securityLogger.warn({
      message: 'Unauthorized note access attempt',
      event: 'unauthorized_note_access',
      context: 'Security',
      ip: this.sanitizeString(params.ip),
      userId: this.sanitizeNumber(params.userId),
      noteId: this.sanitizeString(params.noteId),
      action: this.sanitizeString(params.action),
      reason: this.sanitizeString(params.reason),
    });
  }

  /**
   * WebSocket 연결 실패 로그
   */
  logConnectionFailure(params: {
    ip?: string;
    userId?: number;
    noteId?: string;
    reason: string;
    errorCode?: string;
  }): void {
    securityLogger.warn({
      message: 'WebSocket connection failed',
      event: 'websocket_connection_failure',
      context: 'Security',
      ip: this.sanitizeString(params.ip),
      userId: this.sanitizeNumber(params.userId),
      noteId: this.sanitizeString(params.noteId),
      reason: this.sanitizeString(params.reason),
      errorCode: this.sanitizeString(params.errorCode),
    });
  }

  /**
   * 성공적인 인증 로그
   */
  logAuthSuccess(params: { ip?: string; userId?: number; noteId?: string }): void {
    securityLogger.info({
      message: 'Authentication successful',
      event: 'auth_success',
      context: 'Security',
      ip: this.sanitizeString(params.ip),
      userId: this.sanitizeNumber(params.userId),
      noteId: this.sanitizeString(params.noteId),
    });
  }

  /**
   * 세션 등록 로그
   */
  logSessionRegistered(params: {
    ip?: string;
    userId?: number;
    noteId?: string;
    sessionId: string;
    totalSessions: number;
  }): void {
    securityLogger.info({
      message: 'Session registered',
      event: 'session_registered',
      context: 'Security',
      ip: this.sanitizeString(params.ip),
      userId: this.sanitizeNumber(params.userId),
      noteId: this.sanitizeString(params.noteId),
      sessionId: this.sanitizeString(params.sessionId),
      totalSessions: this.sanitizeNumber(params.totalSessions),
    });
  }

  /**
   * 세션 해제 로그
   */
  logSessionUnregistered(params: {
    ip?: string;
    userId?: number;
    noteId?: string;
    sessionId: string;
    reason?: string;
  }): void {
    securityLogger.info({
      message: 'Session unregistered',
      event: 'session_unregistered',
      context: 'Security',
      ip: this.sanitizeString(params.ip),
      userId: this.sanitizeNumber(params.userId),
      noteId: this.sanitizeString(params.noteId),
      sessionId: this.sanitizeString(params.sessionId),
      reason: this.sanitizeString(params.reason),
    });
  }

  /**
   * XSS 시도 감지 로그
   * 공격 페이로드는 해시로만 기록 (원본 노출 방지, 포렌식용 매칭 가능)
   */
  logXssAttemptDetected(params: {
    ip?: string;
    userId?: number;
    noteId?: string;
    field: string;
    originalValue?: string;
  }): void {
    securityLogger.warn({
      message: 'Potential XSS attempt detected',
      event: 'xss_attempt_detected',
      context: 'Security',
      ip: this.sanitizeString(params.ip),
      userId: this.sanitizeNumber(params.userId),
      noteId: this.sanitizeString(params.noteId),
      field: this.sanitizeString(params.field),
      // 원본 값은 해시로만 기록 (공격 페이로드 노출 방지, 포렌식용 매칭 가능)
      payloadHash: params.originalValue
        ? this.hashSensitiveData(params.originalValue)
        : undefined,
      payloadLength: params.originalValue?.length,
    });
  }

}
