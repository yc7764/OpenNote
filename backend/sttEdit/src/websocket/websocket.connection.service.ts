import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parse as parseCookie } from 'cookie';
import { RedisService } from '../redis/redis.service';
import { ErrorCode } from '../common/error-code.enum';
import { Constants } from '../common/constants.enum';
import { Note } from '../note/entity/note.entity';
import {
  verifyJwtToken,
  validateNoteOwnership,
} from './websocket.validator';
import { parseNoteId } from '../common/utils/note-id.util';

/**
 * 클라이언트 인증 정보
 */
export interface AuthInfo {
  authToken: string | null;
  noteId: string | null;
}

/**
 * 인증 결과
 */
export interface AuthResult {
  success: boolean;
  userId?: string;
  payload?: any;
  errorCode?: ErrorCode;
  message?: string;
  /** 정규화된 noteId(순수 정수 문자열). 이후 authorizedNoteId로 저장된다. */
  noteId?: string;
}

/**
 * 에러 응답 데이터
 */
export interface ErrorResponseData {
  noteId: string | null;
  code: ErrorCode;
  status: 'error';
  userId: string;
}

/**
 * 초기 노트 데이터
 */
export interface InitialNoteData {
  segment: any[];
  summary_text: any[];
  keywords?: any;
  next_action?: any;
  main_topic?: any;
}

@Injectable()
export class WebsocketConnectionService {
  private readonly logger = new Logger(WebsocketConnectionService.name);

  // 연결 수 검사-퇴출-추가를 원자화하는 Lua 스크립트(고정 상수).
  // 동적 값은 전부 KEYS/ARGV로 파라미터화되어 데이터로만 전달된다(코드 주입 없음).
  // userSocketsKey 단일 키만 조작 → CLUSTER에서도 단일 슬롯이라 안전.
  // 반환: 퇴출 대상 소켓 식별자(없으면 빈 문자열).
  private static readonly REGISTER_SESSION_LUA = `
local key = KEYS[1]
local maxConn = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local socketId = ARGV[3]
local evicted = ''
local count = redis.call('ZCARD', key)
if count >= maxConn then
  local oldest = redis.call('ZRANGE', key, 0, 0)
  if #oldest > 0 then
    evicted = oldest[1]
    redis.call('ZREM', key, evicted)
  end
end
redis.call('ZADD', key, now, socketId)
return evicted
`;

  constructor(
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
  ) {}

  /**
   * 클라이언트에서 인증 정보 추출
   * HttpOnly 쿠키에서만 토큰 추출 (XSS 공격 방어)
   */
  extractAuthInfo(client: Socket): AuthInfo {
    let authToken: string | null = null;

    // HttpOnly 쿠키에서만 access_token 추출 (보안 강화)
    const cookieHeader = client.handshake?.headers?.cookie;
    if (cookieHeader) {
      const cookies = parseCookie(cookieHeader);
      authToken = cookies['access_token'] || null;
    }

    const noteId =
      (client.handshake?.auth as any)?.noteId ||
      (client.handshake?.query as any)?.noteId;

    return { authToken, noteId: noteId || null };
  }

  /**
   * WebSocket 클라이언트의 쿠키에서 인증 토큰 추출
   * update 이벤트 핸들러 등에서 사용
   */
  extractTokenFromClient(client: Socket): string | null {
    const cookieHeader = client.handshake?.headers?.cookie;
    if (cookieHeader) {
      const cookies = parseCookie(cookieHeader);
      return cookies['access_token'] || null;
    }
    return null;
  }

  /**
   * 에러 응답 데이터 생성
   */
  createErrorResponse(noteId: string | null, errorCode: ErrorCode, userId = 'system'): ErrorResponseData {
    return {
      noteId,
      code: errorCode,
      status: 'error' as const,
      userId,
    };
  }

  /**
   * 필수 파라미터 검증
   */
  validateRequiredParams(authToken: string | null, noteId: string | null): {
    valid: boolean;
    errorCode?: ErrorCode;
  } {
    if (!authToken) {
      return { valid: false, errorCode: ErrorCode.AUTH_MISSING_TOKEN };
    }
    if (!noteId) {
      return { valid: false, errorCode: ErrorCode.AUTH_MISSING_NOTEID };
    }
    return { valid: true };
  }

  /**
   * JWT 및 노트 권한 검증
   */
  async authenticateAndAuthorize(
    authToken: string,
    noteId: string,
  ): Promise<AuthResult> {
    // JWT 토큰 검증
    const jwtResult = await verifyJwtToken(this.jwtService, authToken);
    if (!jwtResult.success) {
      return {
        success: false,
        errorCode: jwtResult.errorCode,
        message: jwtResult.message,
      };
    }

    const payload = jwtResult.payload;
    const userId = payload.user_id;

    // noteId 형식 검증 + 정규화: 순수 정수만 허용해 parseInt/Number 발산을 차단.
    // 정규화된 문자열을 이후 소유권 판정·authorizedNoteId 저장에 일관되게 사용한다.
    const parsedNoteId = parseNoteId(noteId);
    if (parsedNoteId === null) {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_NOTEID_FORMAT,
        message: `Invalid noteId format: ${noteId}`,
      };
    }
    const normalizedNoteId = String(parsedNoteId);

    // noteId 권한 검증 (정규화된 정수 사용)
    const noteValidation = await validateNoteOwnership(
      this.noteRepository,
      parsedNoteId,
      userId,
    );

    if (!noteValidation.success) {
      return {
        success: false,
        errorCode: noteValidation.errorCode,
        message: noteValidation.message,
      };
    }

    return {
      success: true,
      userId: String(userId),
      payload,
      noteId: normalizedNoteId,
    };
  }

  /**
   * 사용자 세션 등록 (연결 제한 포함)
   * @returns 제거해야 할 가장 오래된 소켓 식별자 (있는 경우)
   */
  async registerSession(
    userId: string,
    instanceId: string,
    clientId: string,
  ): Promise<string | null> {
    const userSocketsKey = `user:${userId}:sockets`;
    const socketIdentifier = `${instanceId}:${clientId}`;
    const now = Date.now();

    // 검사-퇴출-추가를 Lua로 원자 실행 — 같은 사용자의 동시 연결에서
    // zcard→zadd 사이 경쟁으로 MAX를 순간 초과하던 문제를 차단한다.
    const evicted = (await this.redisService.eval(
      WebsocketConnectionService.REGISTER_SESSION_LUA,
      1,
      userSocketsKey,
      Constants.MAX_CONNECTIONS_PER_USER,
      now,
      socketIdentifier,
    )) as string;

    // 전역 만료 세트에도 추가 (다른 슬롯이라 Lua 밖에서 별도 실행 — CROSSSLOT 회피).
    // 퇴출된 소켓의 전역 만료 항목은 해당 소켓 disconnect 시 unregisterSession이 정리한다
    // (기존 동작과 동일).
    const expiryTimestamp = now + Constants.SESSION_MAX_AGE_SECONDS * 1000;
    await this.redisService.zadd(Constants.GLOBAL_SESSION_EXPIRY_KEY, expiryTimestamp, socketIdentifier);

    return evicted && evicted.length > 0 ? evicted : null;
  }

  /**
   * 사용자 세션 해제
   * Redis 에러 시에도 disconnect 흐름이 중단되지 않도록 에러를 catch합니다.
   */
  async unregisterSession(userId: string, instanceId: string, clientId: string): Promise<void> {
    const socketIdentifier = `${instanceId}:${clientId}`;

    const results = await Promise.allSettled([
      this.redisService.zrem(`user:${userId}:sockets`, socketIdentifier),
      this.redisService.zrem(Constants.GLOBAL_SESSION_EXPIRY_KEY, socketIdentifier),
    ]);

    // 에러 로깅 (disconnect 흐름은 중단하지 않음)
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const keyName = index === 0 ? 'user sockets' : 'global session expiry';
        this.logger.error(
          `Failed to unregister session from ${keyName} for ${socketIdentifier}:`,
          result.reason,
        );
      }
    });
  }

  /**
   * Redis에서 노트 초기 데이터 조회 (mget 최적화)
   */
  async fetchInitialNoteData(noteId: string): Promise<InitialNoteData> {
    // 1. segment, summary_text 인덱스 병렬 조회
    const [segmentData, summaryData, singleKeyData] = await Promise.all([
      this.fetchIndexedData(noteId, 'segment'),
      this.fetchIndexedData(noteId, 'summary_text'),
      this.fetchSingleKeys(noteId),
    ]);

    return {
      segment: segmentData,
      summary_text: summaryData,
      ...singleKeyData,
    };
  }

  /**
   * 단일 키 일괄 조회 (keywords, next_action, main_topic)
   */
  private async fetchSingleKeys(noteId: string): Promise<Partial<Pick<InitialNoteData, 'keywords' | 'next_action' | 'main_topic'>>> {
    const singleKeyTypes = ['keywords', 'next_action', 'main_topic'] as const;
    const keys = singleKeyTypes.map((type) => `note:{${noteId}}:${type}`);
    const values = await this.redisService.mget(keys);

    const result: Partial<Pick<InitialNoteData, 'keywords' | 'next_action' | 'main_topic'>> = {};

    values.forEach((value, index) => {
      if (value) {
        try {
          result[singleKeyTypes[index]] = JSON.parse(value);
        } catch (parseError) {
          this.logger.error(`Failed to parse JSON for key ${keys[index]}:`, parseError);
        }
      }
    });

    return result;
  }

  /**
   * 인덱스 기반 데이터 일괄 조회 (segment, summary_text 공통) - mget 사용
   */
  private async fetchIndexedData(noteId: string, type: 'segment' | 'summary_text'): Promise<any[]> {
    const indexKey = `note:{${noteId}}:${type}:index`;
    const ids = await this.redisService.smembers(indexKey);

    if (ids.length === 0) {
      return [];
    }

    // mget으로 일괄 조회
    const keys = ids.map((id) => `note:{${noteId}}:${type}:${id}`);
    const values = await this.redisService.mget(keys);

    const result: any[] = [];
    values.forEach((value, index) => {
      if (value) {
        try {
          result.push(JSON.parse(value));
        } catch (parseError) {
          this.logger.error(`Failed to parse JSON for key ${keys[index]}:`, parseError);
        }
      }
    });

    return result;
  }
}
