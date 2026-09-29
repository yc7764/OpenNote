import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { ErrorCode } from '../common/error-code.enum';
import { Note } from '../note/entity/note.entity';

/**
 * JWT 토큰 검증 결과
 */
export interface JwtValidationResult {
  success: boolean;
  payload?: any;
  errorCode?: ErrorCode;
  message?: string;
}

/**
 * Note 권한 검증 결과
 */
export interface NoteValidationResult {
  success: boolean;
  errorCode?: ErrorCode;
  message?: string;
}

/**
 * JWT 토큰 기본 검증 (서명, 구조)
 */
export async function verifyJwtToken(
  jwtService: JwtService,
  token: string,
): Promise<JwtValidationResult> {
  try {
    // 서명 알고리즘을 HS256으로 고정 — 발급자(Django)가 HS256만 사용하므로
    // 다른 알고리즘으로 서명된 토큰은 구조적으로 거부한다 (알고리즘 혼동 방어)
    const payload = await jwtService.verifyAsync(token, {
      algorithms: ['HS256'],
    });

    // token_type이 'access'가 아니면 거부한다.
    // SimpleJWT는 access/refresh를 같은 키·HS256으로 서명하고 token_type 클레임으로만
    // 구분하므로, 이 검사가 없으면 7일짜리 refresh 토큰이 access처럼 수용된다
    // (로그아웃 후에도 sttEdit 접근이 유지되는 문제). sttEdit은 리소스 접근용
    // access 토큰만 받아야 하며, refresh는 Django 토큰 갱신 전용이다.
    if (payload?.token_type !== 'access') {
      return {
        success: false,
        errorCode: ErrorCode.INVALID_JWT_TOKEN,
        message: 'JWT token is not an access token',
      };
    }

    return {
      success: true,
      payload,
    };
  } catch (error) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_JWT_TOKEN,
      message: error?.message || 'Invalid JWT token',
    };
  }
}

/**
 * JWT 토큰 만료 여부 검증
 */
export function validateTokenExpiry(payload: any): JwtValidationResult {
  // exp가 없거나 숫자가 아니면 아래 NaN 비교가 항상 false가 되어
  // 만료 검사를 영구히 통과하므로 명시적으로 거부한다
  if (typeof payload?.exp !== 'number') {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_JWT_TOKEN,
      message: 'JWT token has no valid exp claim',
    };
  }

  const now = Date.now();
  const expiryTime = payload.exp * 1000;

  if (expiryTime <= now) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_JWT_EXPIRED,
      message: 'JWT token has expired',
    };
  }

  return {
    success: true,
    payload,
  };
}

/**
 * JWT 토큰의 user_id와 예상 userId 일치 여부 검증
 */
export function validateTokenUser(
  payload: any,
  expectedUserId: string | number,
): JwtValidationResult {
  const tokenUserId = String(payload.user_id);
  const expectedUserIdStr = String(expectedUserId);

  if (tokenUserId !== expectedUserIdStr) {
    return {
      success: false,
      errorCode: ErrorCode.JWT_USER_MISMATCH,
      message: `Token user_id (${tokenUserId}) does not match expected userId (${expectedUserIdStr})`,
    };
  }

  return {
    success: true,
    payload,
  };
}

/**
 * noteId에 대한 사용자 권한 검증
 */
export async function validateNoteOwnership(
  noteRepository: Repository<Note>,
  noteId: number,
  userId: string | number,
): Promise<NoteValidationResult> {
  try {
    const note = await noteRepository.findOne({
      where: { id: noteId },
      select: ['id', 'userId', 'deletedAt'],
    });

    if (!note) {
      return {
        success: false,
        errorCode: ErrorCode.INITIAL_DATA_FETCH_FAILURE,
        message: `Note with id ${noteId} not found`,
      };
    }

    // 휴지통(소프트 삭제) 노트는 소켓 접근 자체를 거부한다 — Django/프론트는 걸러주지만
    // 소켓은 UI를 거치지 않고 직접 호출 가능하므로 서버 경계에서 막아야 한다.
    if (note.deletedAt !== null && note.deletedAt !== undefined) {
      return {
        success: false,
        errorCode: ErrorCode.NOTE_DELETED,
        message: `Note ${noteId} is in trash (soft-deleted)`,
      };
    }

    const noteUserId = String(note.userId);
    const expectedUserId = String(userId);

    if (noteUserId !== expectedUserId) {
      return {
        success: false,
        errorCode: ErrorCode.UNAUTHORIZED_NOTE_ACCESS,
        message: `User ${userId} does not have access to note ${noteId}`,
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      errorCode: ErrorCode.DB_UPDATE_FAILURE,
      message: error?.message || 'Database query failed',
    };
  }
}
