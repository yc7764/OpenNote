import { CorsIoAdapter } from './cors-io.adapter';
import { IoAdapter } from '@nestjs/platform-socket.io';

/**
 * 회귀: WebSocket CORS를 데코레이터 평가 시점 process.env가 아니라
 * 부트스트랩의 ConfigService에서 읽어 주입하는지 검증.
 */
describe('CorsIoAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('ConfigService의 ALLOWED_ORIGINS를 cors.origin으로 주입하고 기존 옵션을 보존한다', () => {
    const superSpy = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue('server' as any);
    const config = { get: jest.fn().mockReturnValue('https://a.com,https://b.com') };

    const adapter = new CorsIoAdapter({} as any, config as any);
    adapter.createIOServer(3000, { path: '/x' } as any);

    expect(config.get).toHaveBeenCalledWith('ALLOWED_ORIGINS');
    const passedOptions = superSpy.mock.calls[0][1] as any;
    expect(passedOptions.cors).toEqual({
      origin: ['https://a.com', 'https://b.com'],
      credentials: true,
    });
    expect(passedOptions.path).toBe('/x'); // 기존 옵션 보존
  });

  it('ALLOWED_ORIGINS 미설정 시 origin:false로 닫는다 (전체 허용 방지)', () => {
    const superSpy = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue('server' as any);
    const config = { get: jest.fn().mockReturnValue(undefined) };

    const adapter = new CorsIoAdapter({} as any, config as any);
    adapter.createIOServer(3000);

    const passedOptions = superSpy.mock.calls[0][1] as any;
    expect(passedOptions.cors.origin).toBe(false);
    expect(passedOptions.cors.credentials).toBe(true);
  });
});
