import { websocketServer } from './websocket.server';

/**
 * 회귀: status 핸들러는 예전에 원시 data를 {...data}로 브로드캐스트했다.
 * 미검증 필드가 그대로 룸+pub/sub로 증폭되면 (1) 대용량 페이로드 DoS,
 * (2) 노트 공유 도입 시 cross-user XSS로 승격된다.
 * 검증된 화이트리스트 필드만 재조립해 내보내는지 확인한다.
 */
describe('websocketServer.handleWorking - status 화이트리스트', () => {
  function createGateway() {
    const prometheus = { recordWebSocketMessage: jest.fn() };
    const gw = new websocketServer(
      {} as any, // redisService (happy path 미사용)
      {} as any, // jwtService
      {} as any, // connectionService
      prometheus as any,
      {} as any, // securityLogger
    );
    const broadcast = jest
      .spyOn(gw as any, 'broadcastToNote')
      .mockResolvedValue(undefined);
    return { gw, broadcast, prometheus };
  }

  function createClient() {
    return {
      id: 'socket-1',
      data: {
        authorizedNoteId: '123',
        user: { user_id: 1, exp: Math.floor(Date.now() / 1000) + 600 },
      },
    };
  }

  it('검증된 필드만 브로드캐스트하고 공격자 주입 필드는 제거한다', async () => {
    const { gw, broadcast } = createGateway();
    const client = createClient();

    await gw.handleWorking(
      {
        noteId: '123',
        type: 'segment',
        status: 'start',
        segmentId: '5',
        userId: '1',
        // 화이트리스트에 없는 필드 — 브로드캐스트에서 제거되어야 함
        evil: '<script>alert(1)</script>',
        __proto__polluted: true,
      } as any,
      client as any,
    );

    expect(broadcast).toHaveBeenCalledTimes(1);
    const payload = broadcast.mock.calls[0][2];
    expect(payload).toEqual({
      noteId: '123',
      type: 'segment',
      status: 'start',
      segmentId: '5',
      userId: '1',
      socketId: 'socket-1',
    });
    expect(payload).not.toHaveProperty('evil');
  });

  it('허용되지 않은 status 값은 브로드캐스트하지 않는다', async () => {
    const { gw, broadcast } = createGateway();
    const client = createClient();

    await gw.handleWorking(
      { noteId: '123', type: 'segment', status: 'HACK', segmentId: '5', userId: '1' } as any,
      client as any,
    );

    expect(broadcast).not.toHaveBeenCalled();
  });

  it('콜론이 섞인 segmentId는 브로드캐스트하지 않는다 (형식 검증)', async () => {
    const { gw, broadcast } = createGateway();
    const client = createClient();

    await gw.handleWorking(
      { noteId: '123', type: 'segment', status: 'start', segmentId: '1:2', userId: '1' } as any,
      client as any,
    );

    expect(broadcast).not.toHaveBeenCalled();
  });

  it('authorizedNoteId와 다른 noteId는 차단한다 (cross-note 방지)', async () => {
    const { gw, broadcast } = createGateway();
    const client = createClient();

    await gw.handleWorking(
      { noteId: '999', type: 'segment', status: 'start', segmentId: '5', userId: '1' } as any,
      client as any,
    );

    expect(broadcast).not.toHaveBeenCalled();
  });
});
