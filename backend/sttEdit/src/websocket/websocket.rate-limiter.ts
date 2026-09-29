import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { ErrorCode } from '../common/error-code.enum';
import { Constants } from '../common/constants.enum';

/**
 * Rate Limiting 검증 결과
 */
export interface RateLimitResult {
  success: boolean;
  errorCode?: ErrorCode;
  message?: string;
  retryAfterMs?: number;
  /** Redis 장애로 인해 폴백 정책이 적용되었는지 여부 */
  fallbackUsed?: boolean;
}

const logger = new Logger('RateLimiter');

/**
 * Sliding Window Rate Limiter (Redis 기반)
 * - 분당 60회 제한
 * - Redis 장애 시 Fail-Open 정책 적용 (요청 허용)
 */
export async function checkRateLimit(
  redisService: RedisService,
  userId: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const minuteKey = `ratelimit:${userId}:minute`;

  try {
    const result = await checkSlidingWindow(
      redisService,
      minuteKey,
      now,
      Constants.RATE_LIMIT_WINDOW_SECONDS * 1000,
      Constants.RATE_LIMIT_MAX_PER_MINUTE,
    );

    if (!result.allowed) {
      return {
        success: false,
        errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: `Rate limit exceeded: max ${Constants.RATE_LIMIT_MAX_PER_MINUTE} requests per minute`,
        retryAfterMs: result.retryAfterMs,
      };
    }

    return { success: true };
  } catch (error) {
    // Fail-Open 정책: Redis 장애 시 요청을 허용
    // 서비스 가용성을 우선시하여 일시적으로 rate limit을 무효화
    logger.warn(
      `Rate limiter Redis error for user ${userId}, applying fail-open policy: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    return { success: true, fallbackUsed: true };
  }
}

/**
 * Sliding Window Lua 스크립트 (원자화).
 * 기존 구현은 5왕복(zremrangebyscore→zcard→zrange→zadd→expire)이라 동시 이벤트가
 * zcard→zadd 사이에 끼면 한도를 초과 통과(TOCTOU)할 수 있었다. 단일 키라 CLUSTER에서도 안전.
 *
 * KEYS[1] = ratelimit 키
 * ARGV = [now(ms), windowMs, maxRequests, member]
 * 반환 = [allowed(1|0), retryAfterMs]
 */
const SLIDING_WINDOW_LUA = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local windowMs = tonumber(ARGV[2])
  local maxRequests = tonumber(ARGV[3])
  local member = ARGV[4]

  redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)

  local count = redis.call('ZCARD', key)
  if count >= maxRequests then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retryAfterMs = windowMs
    if oldest[2] then
      retryAfterMs = math.max(tonumber(oldest[2]) + windowMs - now, 0)
    end
    return { 0, retryAfterMs }
  end

  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, math.ceil(windowMs / 1000) + 1)
  return { 1, 0 }
`;

/**
 * Sliding Window 알고리즘으로 요청 허용 여부 체크
 * Redis Sorted Set 사용 (score = timestamp), Lua 단일 스크립트로 원자 실행
 */
async function checkSlidingWindow(
  redisService: RedisService,
  key: string,
  now: number,
  windowMs: number,
  maxRequests: number,
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  // 멤버는 now:uuid로 고유화 — 같은 ms 내 다수 요청의 ZSET 멤버 충돌(한도 우회) 방지
  const member = `${now}:${randomUUID()}`;

  const result = (await redisService.eval(
    SLIDING_WINDOW_LUA,
    1,
    key,
    now,
    windowMs,
    maxRequests,
    member,
  )) as [number, number];

  if (result[0] === 1) {
    return { allowed: true };
  }
  return { allowed: false, retryAfterMs: Math.max(Number(result[1]) || 0, 0) };
}
