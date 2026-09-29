import { checkRateLimit } from './websocket.rate-limiter';
import { RedisService } from '../redis/redis.service';
import { Constants } from '../common/constants.enum';

/**
 * Lua sliding-window 스크립트의 의미를 JS로 재현한 fake RedisService.
 * (5왕복 → 단일 eval로 원자화되면서 fake도 eval 시뮬레이션으로 전환)
 * 멤버는 유일(Map 키)하므로 실제 Redis ZSET의 "동일 멤버 덮어쓰기" 의미를 재현한다.
 */
function createFakeRedis() {
  const store = new Map<string, Map<string, number>>();
  const get = (key: string) => {
    let z = store.get(key);
    if (!z) {
      z = new Map();
      store.set(key, z);
    }
    return z;
  };
  return {
    // RedisService.eval = Redis EVAL(서버측 Lua) 래퍼의 모킹 — JS eval()과 무관
    async eval(_script: string, _numKeys: number, ...args: (string | number)[]) {
      const [key, nowArg, windowArg, maxArg, member] = args as [string, number, number, number, string];
      const now = Number(nowArg);
      const windowMs = Number(windowArg);
      const maxRequests = Number(maxArg);
      const z = get(key);

      // ZREMRANGEBYSCORE key 0 now-windowMs
      for (const [m, score] of z) {
        if (score <= now - windowMs) z.delete(m);
      }

      // ZCARD >= max → 거부 + 가장 오래된 score로 retryAfter 계산
      if (z.size >= maxRequests) {
        const oldest = [...z.values()].sort((a, b) => a - b)[0];
        const retryAfterMs = oldest !== undefined ? Math.max(oldest + windowMs - now, 0) : windowMs;
        return [0, retryAfterMs];
      }

      // ZADD (동일 멤버는 덮어쓰기 — Map.set이 동일 의미)
      z.set(member, now);
      return [1, 0];
    },
  } as unknown as RedisService;
}

describe('checkRateLimit - Lua 원자화 + 멤버 고유화', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('같은 ms 내 한도 초과 요청은 차단된다 (멤버 충돌 우회 회귀 방지)', async () => {
    // 모든 요청이 동일 타임스탬프를 갖도록 고정 — 구버전은 멤버가 now.toString()로
    // 충돌해 카운트가 1에 고정, 한도가 영원히 걸리지 않았다.
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const redis = createFakeRedis();
    const max = Constants.RATE_LIMIT_MAX_PER_MINUTE;

    // 한도까지는 전부 허용
    for (let i = 0; i < max; i++) {
      const r = await checkRateLimit(redis, 'user-1');
      expect(r.success).toBe(true);
    }

    // 한도 초과 요청은 거부
    const over = await checkRateLimit(redis, 'user-1');
    expect(over.success).toBe(false);
    expect(over.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  it('동시 요청 폭주도 단일 eval이라 한도를 초과 통과할 수 없다 (TOCTOU 회귀 방지)', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const redis = createFakeRedis();
    const max = Constants.RATE_LIMIT_MAX_PER_MINUTE;

    // 한도의 2배를 동시에 발사 — 구버전(5왕복)은 zcard→zadd 틈으로 초과 통과 가능했다
    const results = await Promise.all(
      Array.from({ length: max * 2 }, () => checkRateLimit(redis, 'user-1')),
    );
    const allowed = results.filter((r) => r.success).length;
    expect(allowed).toBe(max);
  });

  it('윈도우가 지나면 다시 허용된다 (sliding window 동작 보존)', async () => {
    const t0 = 1_700_000_000_000;
    const windowMs = Constants.RATE_LIMIT_WINDOW_SECONDS * 1000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const redis = createFakeRedis();
    const max = Constants.RATE_LIMIT_MAX_PER_MINUTE;

    for (let i = 0; i < max; i++) {
      await checkRateLimit(redis, 'user-1');
    }
    expect((await checkRateLimit(redis, 'user-1')).success).toBe(false);

    // 윈도우 경과 후에는 만료 제거로 다시 허용
    spy.mockReturnValue(t0 + windowMs + 1);
    expect((await checkRateLimit(redis, 'user-1')).success).toBe(true);
  });

  it('Redis 장애 시 fail-open으로 허용된다 (수용 결정 보존)', async () => {
    const redis = {
      async eval() {
        throw new Error('redis down');
      },
    } as unknown as RedisService;

    const r = await checkRateLimit(redis, 'user-1');
    expect(r.success).toBe(true);
    expect(r.fallbackUsed).toBe(true);
  });
});
