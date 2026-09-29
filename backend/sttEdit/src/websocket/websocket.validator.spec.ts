import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../common/error-code.enum';
import { validateNoteOwnership, validateTokenExpiry, verifyJwtToken } from './websocket.validator';
import { Repository } from 'typeorm';
import { Note } from '../note/entity/note.entity';

describe('validateTokenExpiry', () => {
  it('미래 exp는 통과한다', () => {
    const result = validateTokenExpiry({
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    expect(result.success).toBe(true);
  });

  it('과거 exp는 거부한다', () => {
    const result = validateTokenExpiry({
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.INVALID_JWT_EXPIRED);
  });

  it('exp가 없는 토큰은 거부한다 (NaN 비교로 영구 유효가 되던 회귀 방지)', () => {
    const result = validateTokenExpiry({ user_id: 1 });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.INVALID_JWT_TOKEN);
  });

  it('exp가 숫자가 아니면 거부한다', () => {
    const result = validateTokenExpiry({ exp: 'not-a-number' });
    expect(result.success).toBe(false);
  });
});

describe('verifyJwtToken', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });

  it('access 토큰(token_type=access)은 통과한다', async () => {
    const token = jwtService.sign(
      { user_id: 1, token_type: 'access' },
      { expiresIn: '1m' },
    );
    const result = await verifyJwtToken(jwtService, token);
    expect(result.success).toBe(true);
  });

  it('HS256 이외 알고리즘으로 서명된 토큰은 거부한다 (알고리즘 고정 회귀 방지)', async () => {
    const token = jwtService.sign(
      { user_id: 1, token_type: 'access' },
      { algorithm: 'HS384', expiresIn: '1m' },
    );
    const result = await verifyJwtToken(jwtService, token);
    expect(result.success).toBe(false);
  });

  it('refresh 토큰(token_type=refresh)은 거부한다 (refresh를 access로 수용 방지)', async () => {
    // SimpleJWT는 access/refresh를 같은 키·HS256으로 서명하므로 서명·만료는 통과하지만
    // token_type으로 걸러야 한다. 이 검사가 없으면 7일짜리 refresh가 access처럼 수용된다.
    const token = jwtService.sign(
      { user_id: 1, token_type: 'refresh' },
      { expiresIn: '7d' },
    );
    const result = await verifyJwtToken(jwtService, token);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.INVALID_JWT_TOKEN);
    // 서명·알고리즘 거부가 아니라 정확히 token_type 사유로 거부됨을 못박는다
    // (같은 키로 서명해 서명 검증은 통과하므로, 실패는 token_type 때문임이 보장됨)
    expect(result.message).toBe('JWT token is not an access token');
  });

  it('token_type 클레임이 없는 토큰은 거부한다', async () => {
    const token = jwtService.sign({ user_id: 1 }, { expiresIn: '1m' });
    const result = await verifyJwtToken(jwtService, token);
    expect(result.success).toBe(false);
  });
});

describe('validateNoteOwnership — 휴지통(soft delete) 차단', () => {
  function fakeRepo(row: Partial<Note> | null): Repository<Note> {
    return { findOne: async () => row } as unknown as Repository<Note>;
  }

  it('휴지통 노트는 소유자여도 NOTE_DELETED로 거부한다', async () => {
    const repo = fakeRepo({ id: 1, userId: 7, deletedAt: new Date() } as Note);
    const result = await validateNoteOwnership(repo, 1, 7);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.NOTE_DELETED);
  });

  it('삭제되지 않은 본인 노트는 통과한다', async () => {
    const repo = fakeRepo({ id: 1, userId: 7, deletedAt: null } as Note);
    const result = await validateNoteOwnership(repo, 1, 7);
    expect(result.success).toBe(true);
  });

  it('타인 노트는 UNAUTHORIZED_NOTE_ACCESS로 거부한다 (기존 동작 보존)', async () => {
    const repo = fakeRepo({ id: 1, userId: 8, deletedAt: null } as Note);
    const result = await validateNoteOwnership(repo, 1, 7);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.UNAUTHORIZED_NOTE_ACCESS);
  });
});
