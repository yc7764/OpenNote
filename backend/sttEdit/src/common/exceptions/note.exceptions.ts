import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../error-code.enum';

/**
 * 노트 접근 권한이 없을 때 발생하는 예외
 */
export class NotePermissionException extends HttpException {
  public readonly errorCode = ErrorCode.UNAUTHORIZED_NOTE_ACCESS;

  constructor(
    public readonly noteId: string | number,
    public readonly userId: string | number,
    public readonly ownerId: string | number,
  ) {
    super(
      {
        errorCode: ErrorCode.UNAUTHORIZED_NOTE_ACCESS,
        message: `User ${userId} does not have permission to modify note ${noteId} (owner: ${ownerId})`,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * 휴지통(소프트 삭제) 노트에 기록을 시도할 때 발생하는 예외.
 * 재시도해도 해소되지 않는 영구 오류로 취급된다(스케줄러가 키를 폐기).
 */
export class NoteDeletedException extends HttpException {
  public readonly errorCode = ErrorCode.NOTE_DELETED;

  constructor(public readonly noteId: string | number) {
    super(
      {
        errorCode: ErrorCode.NOTE_DELETED,
        message: `Note ${noteId} is in trash (soft-deleted); writes are rejected`,
      },
      HttpStatus.GONE,
    );
  }
}

/**
 * 잘못된 키 형식일 때 발생하는 예외
 */
export class InvalidKeyFormatException extends HttpException {
  public readonly errorCode = ErrorCode.INVALID_DATA_TYPE;

  constructor(
    public readonly key: string,
    public readonly expectedFormat: string,
  ) {
    super(
      {
        errorCode: ErrorCode.INVALID_DATA_TYPE,
        message: `Invalid key format: ${key}. Expected: ${expectedFormat}`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * noteId 형식이 유효하지 않을 때 발생하는 예외
 */
export class InvalidNoteIdException extends HttpException {
  public readonly errorCode = ErrorCode.INVALID_NOTEID_FORMAT;

  constructor(public readonly noteId: string | number) {
    super(
      {
        errorCode: ErrorCode.INVALID_NOTEID_FORMAT,
        message: `Invalid noteId format: ${noteId}`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * 필수 데이터가 누락되었을 때 발생하는 예외
 */
export class MissingDataException extends HttpException {
  public readonly errorCode = ErrorCode.MISSING_REQUIRED_FIELD;

  constructor(
    public readonly field: string,
    public readonly context: string,
  ) {
    super(
      {
        errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
        message: `${field} is missing in ${context}`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
