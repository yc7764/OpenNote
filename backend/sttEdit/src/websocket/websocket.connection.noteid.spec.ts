import { WebsocketConnectionService } from './websocket.connection.service';
import { ErrorCode } from '../common/error-code.enum';
import * as validator from './websocket.validator';

/**
 * 회귀: 핸드셰이크 noteId 형식 검증 + 정규화.
 * 비정규 표기("1e3" 등)는 소유권 검증에 도달하기 전에 거부되고,
 * 정규 noteId만 정규화된 문자열로 반환되어 authorizedNoteId에 저장된다.
 */
describe('WebsocketConnectionService.authenticateAndAuthorize noteId 검증', () => {
  function makeService() {
    return new WebsocketConnectionService({} as any, {} as any, {} as any);
  }

  beforeEach(() => {
    jest.spyOn(validator, 'verifyJwtToken').mockResolvedValue({
      success: true,
      payload: { user_id: 7 },
    } as any);
    jest
      .spyOn(validator, 'validateNoteOwnership')
      .mockResolvedValue({ success: true } as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('비정규 noteId "1e3"는 소유권 검증 전에 INVALID_NOTEID_FORMAT로 거부된다', async () => {
    const svc = makeService();
    const result = await svc.authenticateAndAuthorize('token', '1e3');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.INVALID_NOTEID_FORMAT);
    // 발산 방지 핵심: Number("1e3")=1000으로 소유권 검증이 호출되면 안 된다
    expect(validator.validateNoteOwnership).not.toHaveBeenCalled();
  });

  it('정규 noteId는 정규화된 문자열을 반환하고 소유권 검증에 정수를 넘긴다', async () => {
    const svc = makeService();
    const result = await svc.authenticateAndAuthorize('token', '123');

    expect(result.success).toBe(true);
    expect(result.noteId).toBe('123');
    expect(validator.validateNoteOwnership).toHaveBeenCalledWith(
      expect.anything(),
      123,
      7,
    );
  });
});
