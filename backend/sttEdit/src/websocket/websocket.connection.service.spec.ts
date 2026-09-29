import { WebsocketConnectionService } from './websocket.connection.service';
import { RedisService } from '../redis/redis.service';
import { Constants } from '../common/constants.enum';

/**
 * 회귀: registerSession의 검사-퇴출-추가를 Lua(eval)로 원자화했다.
 * fake eval이 Lua 의미(ZCARD/ZRANGE/ZREM/ZADD)를 재현하도록 해서
 * MAX 도달 시 가장 오래된 소켓을 퇴출하고 그 식별자를 반환하는 계약을 검증한다.
 */
function createFakeRedis() {
  const zsets = new Map<string, Map<string, number>>();
  const z = (k: string) => {
    let m = zsets.get(k);
    if (!m) {
      m = new Map();
      zsets.set(k, m);
    }
    return m;
  };
  return {
    _zsets: zsets,
    // Lua REGISTER_SESSION_LUA 의미 재현 (단일 키)
    async eval(
      _script: string,
      _numKeys: number,
      key: string,
      maxConn: number,
      now: number,
      socketId: string,
    ) {
      const set = z(key);
      let evicted = '';
      if (set.size >= Number(maxConn)) {
        const sorted = [...set.entries()].sort((a, b) => a[1] - b[1]);
        if (sorted.length > 0) {
          evicted = sorted[0][0];
          set.delete(evicted);
        }
      }
      set.set(socketId, Number(now));
      return evicted;
    },
    async zadd(key: string, score: number, member: string) {
      z(key).set(member, score);
      return 1;
    },
  } as unknown as RedisService & { _zsets: Map<string, Map<string, number>> };
}

describe('WebsocketConnectionService.registerSession 원자화', () => {
  let nowCounter = 1_700_000_000_000;

  beforeEach(() => {
    nowCounter = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowCounter++);
  });

  afterEach(() => jest.restoreAllMocks());

  function makeService(redis: RedisService) {
    return new WebsocketConnectionService(redis, {} as any, {} as any);
  }

  it('MAX 미만에서는 퇴출 없이 null을 반환한다', async () => {
    const redis = createFakeRedis();
    const svc = makeService(redis);

    for (let i = 0; i < Constants.MAX_CONNECTIONS_PER_USER; i++) {
      const evicted = await svc.registerSession('u1', 'inst', `c${i}`);
      expect(evicted).toBeNull();
    }
    expect(redis._zsets.get('user:u1:sockets')!.size).toBe(Constants.MAX_CONNECTIONS_PER_USER);
  });

  it('MAX 도달 시 가장 오래된 소켓을 퇴출하고 식별자를 반환한다', async () => {
    const redis = createFakeRedis();
    const svc = makeService(redis);

    for (let i = 0; i < Constants.MAX_CONNECTIONS_PER_USER; i++) {
      await svc.registerSession('u1', 'inst', `c${i}`);
    }
    // 한도 초과 연결 → 가장 오래된 inst:c0가 퇴출되어야 함
    const evicted = await svc.registerSession('u1', 'inst', 'c-new');
    expect(evicted).toBe('inst:c0');
    // 여전히 MAX 유지 (초과 없음)
    expect(redis._zsets.get('user:u1:sockets')!.size).toBe(Constants.MAX_CONNECTIONS_PER_USER);
  });
});
