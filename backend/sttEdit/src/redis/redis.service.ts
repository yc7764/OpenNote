import { Injectable, Inject, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { PrometheusService } from '../monitoring/prometheus.service';

/**
 * Redis 작업 실패 시 발생하는 예외
 */
export class RedisOperationException extends Error {
  constructor(
    public readonly operation: string,
    public readonly key: string,
    public readonly originalError: Error,
  ) {
    super(`Redis ${operation} failed for key "${key}": ${originalError.message}`);
    this.name = 'RedisOperationException';
  }

  /**
   * 재시도 가능한 에러인지 판별
   * - 연결 문제, 타임아웃 등은 재시도 가능
   */
  isRetryable(): boolean {
    const msg = this.originalError.message.toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('connection') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('econnreset')
    );
  }
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private subscriber: Redis;
  private publisher: Redis;
  private messageHandlers = new Map<string, (message: string) => void>();
  private pmessageHandlers = new Map<string, (channel: string, message: string) => void>();
  private listenersInitialized = false;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Optional() private readonly prometheusService?: PrometheusService,
  ) {
    // Publisher와 Subscriber를 위한 별도 연결 생성
    this.publisher = this.redis.duplicate();
    this.subscriber = this.redis.duplicate();
    // 리스너 초기화
    this.initListeners();
  }

  /**
   * Redis 작업을 에러 핸들링 및 메트릭 수집과 함께 실행
   */
  private async executeWithErrorHandling<T>(
    operation: string,
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      // 메트릭 기록 (성공)
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.prometheusService?.recordRedisOperation(operation, true, durationSeconds);
      return result;
    } catch (error) {
      const err = error as Error;
      // 메트릭 기록 (실패)
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.prometheusService?.recordRedisOperation(operation, false, durationSeconds);
      this.logger.error(`Redis ${operation} failed for key "${key}": ${err.message}`, err);
      throw new RedisOperationException(operation, key, err);
    }
  }

  async onModuleDestroy() {
    // 이벤트 리스너 제거 (메모리 누수 방지)
    this.subscriber.removeAllListeners('message');
    this.subscriber.removeAllListeners('error');
    this.publisher.removeAllListeners('error');
    this.redis.removeAllListeners('error');

    // Redis 연결 종료
    await this.publisher.quit();
    await this.subscriber.quit();
    await this.redis.quit();
  }

  // 키-값 저장
  async set(key: string, value: string, ttl?: number): Promise<void> {
    return this.executeWithErrorHandling('SET', key, async () => {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
      }
    });
  }

  // 키-값 조회
  async get(key: string): Promise<string | null> {
    return this.executeWithErrorHandling('GET', key, () => this.redis.get(key));
  }

  // 여러 키-값 한번에 조회
  async mget(keys: string[]): Promise<(string | null)[]> {
    return this.executeWithErrorHandling('MGET', keys.join(','), () => this.redis.mget(keys));
  }

  // Sorted Set에 멤버 추가
  async zadd(key: string, score: number, member: string): Promise<number | string> {
    return this.executeWithErrorHandling('ZADD', key, () => this.redis.zadd(key, score, member));
  }

  // Sorted Set의 멤버 수 조회
  async zcard(key: string): Promise<number> {
    return this.executeWithErrorHandling('ZCARD', key, () => this.redis.zcard(key));
  }

  // Sorted Set에서 index 범위로 멤버 조회
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.executeWithErrorHandling('ZRANGE', key, () => this.redis.zrange(key, start, stop));
  }

  // Sorted Set에서 score 범위로 멤버 조회
  async zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]> {
    return this.executeWithErrorHandling('ZRANGEBYSCORE', key, () => this.redis.zrangebyscore(key, min, max));
  }

  // Sorted Set에서 특정 멤버(들) 제거
  async zrem(key: string, member: string | string[]): Promise<number> {
    return this.executeWithErrorHandling('ZREM', key, async () => {
      if (Array.isArray(member)) {
        return await this.redis.zrem(key, ...member);
      }
      return await this.redis.zrem(key, member);
    });
  }

  // Sorted Set에서 score 범위로 멤버 제거
  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    return this.executeWithErrorHandling('ZREMRANGEBYSCORE', key, () => this.redis.zremrangebyscore(key, min, max));
  }

  // Redis 서버측 Lua 스크립트 원자 실행 (Redis EVAL — JS eval과 무관).
  // 보안: script는 코드 내 고정 상수만 전달할 것. 사용자 입력은 반드시 args(KEYS/ARGV)로
  // 파라미터화되어 데이터로만 전달되므로 코드 주입 경로가 없다.
  // CLUSTER 모드에서는 KEYS가 모두 같은 슬롯이어야 한다(단일 키 사용 권장).
  // 로그/라우팅 키로 첫 KEY를 사용한다.
  async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown> {
    const keyForLog = numKeys > 0 && args.length > 0 ? String(args[0]) : 'eval';
    return this.executeWithErrorHandling('EVAL', keyForLog, () =>
      (this.redis as any).eval(script, numKeys, ...args),
    );
  }

  // Hash에서 특정 필드 값 조회
  async hget(key: string, field: string): Promise<string | null> {
    return this.executeWithErrorHandling('HGET', key, () => this.redis.hget(key, field));
  }

  // Hash에서 여러 필드 값 조회
  async hmget(key: string, fields: string[]): Promise<(string | null)[]> {
    return this.executeWithErrorHandling('HMGET', key, () => this.redis.hmget(key, ...fields));
  }

  // Hash의 모든 필드-값 조회
  async hgetall(key: string): Promise<Record<string, string>> {
    return this.executeWithErrorHandling('HGETALL', key, () => this.redis.hgetall(key));
  }

  // Hash에서 특정 필드 삭제
  async hdel(key: string, field: string | string[]): Promise<number> {
    return this.executeWithErrorHandling('HDEL', key, async () => {
      if (Array.isArray(field)) {
        return await this.redis.hdel(key, ...field);
      }
      return await this.redis.hdel(key, field);
    });
  }

  // Set에 멤버 추가
  async sadd(key: string, member: string | string[]): Promise<number> {
    return this.executeWithErrorHandling('SADD', key, async () => {
      if (Array.isArray(member)) {
        return await this.redis.sadd(key, ...member);
      }
      return await this.redis.sadd(key, member);
    });
  }

  // Set의 모든 멤버 조회
  async smembers(key: string): Promise<string[]> {
    return this.executeWithErrorHandling('SMEMBERS', key, () => this.redis.smembers(key));
  }

  // Set에서 특정 멤버 제거
  async srem(key: string, member: string | string[]): Promise<number> {
    return this.executeWithErrorHandling('SREM', key, async () => {
      if (Array.isArray(member)) {
        return await this.redis.srem(key, ...member);
      }
      return await this.redis.srem(key, member);
    });
  }

  // Set의 카디널리티(멤버 수) 조회
  async scard(key: string): Promise<number> {
    return this.executeWithErrorHandling('SCARD', key, () => this.redis.scard(key));
  }

  // 키 삭제
  async del(key: string): Promise<number> {
    return this.executeWithErrorHandling('DEL', key, () => this.redis.del(key));
  }

  // 카운터 1 증가
  async incr(key: string): Promise<number> {
    return this.executeWithErrorHandling('INCR', key, () => this.redis.incr(key));
  }

  // 키 존재 여부 확인
  async exists(key: string): Promise<number> {
    return this.executeWithErrorHandling('EXISTS', key, () => this.redis.exists(key));
  }

  // TTL 조회
  async ttl(key: string): Promise<number> {
    return this.executeWithErrorHandling('TTL', key, () => this.redis.ttl(key));
  }

  // TTL 설정
  async expire(key: string, ttl: number): Promise<number> {
    return this.executeWithErrorHandling('EXPIRE', key, () => this.redis.expire(key, ttl));
  }

  /**
   * Hash에 필드-값을 저장하고, Sorted Set에 만료 시간을 원자적으로 설정합니다.
   * 인덱스(SADD)는 Lua 스크립트 전에 먼저 실행하여 CROSSSLOT 에러를 방지합니다.
   * @param hashKey HASH 키 (화자 데이터)
   * @param expiryKey ZSET 키 (만료 시간 관리용)
   * @param indexKey SET 키 (스케줄러 인덱스)
   * @param field HASH 필드명
   * @param value HASH 값
   * @param expiryScore ZSET score (Unix timestamp)
   * @param indexValue SET에 추가할 값 (noteId)
   */
  async hsetWithExpiry(
    hashKey: string,
    expiryKey: string,
    indexKey: string,
    field: string,
    value: string,
    expiryScore: number,
    indexValue: string,
  ): Promise<void> {
    return this.executeWithErrorHandling('HSET_WITH_EXPIRY', hashKey, async () => {
      // 1. 인덱스 먼저 등록 (실패 시 데이터도 저장 안됨)
      await this.redis.sadd(indexKey, indexValue);

      // 2. HSET + ZADD 원자적 실행
      const script = `
        redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
        redis.call('ZADD', KEYS[2], tonumber(ARGV[3]), ARGV[1])
        return 1
      `;
      await this.redis.eval(script, 2, hashKey, expiryKey, field, value, expiryScore);
    });
  }

  /**
   * 여러 필드-값을 Hash에 저장하고, Sorted Set에 만료 시간을 원자적으로 설정합니다.
   * 인덱스(SADD)는 Lua 스크립트 전에 먼저 실행하여 CROSSSLOT 에러를 방지합니다.
   * @param hashKey HASH 키
   * @param expiryKey ZSET 키
   * @param indexKey SET 키 (스케줄러 인덱스)
   * @param entries { field: value } 형태의 객체
   * @param expiryScore ZSET score (Unix timestamp)
   * @param indexValue SET에 추가할 값 (noteId)
   */
  async hmsetWithExpiry(
    hashKey: string,
    expiryKey: string,
    indexKey: string,
    entries: Record<string, string>,
    expiryScore: number,
    indexValue: string,
  ): Promise<void> {
    return this.executeWithErrorHandling('HMSET_WITH_EXPIRY', hashKey, async () => {
      // 1. 인덱스 먼저 등록 (실패 시 데이터도 저장 안됨)
      await this.redis.sadd(indexKey, indexValue);

      // 2. entries를 [field1, value1, field2, value2, ...] 형태로 변환
      const fields = Object.keys(entries);
      const args: (string | number)[] = [];
      for (const field of fields) {
        args.push(field, entries[field]);
      }

      // 3. HSET + ZADD 원자적 실행
      const script = `
        local hashKey = KEYS[1]
        local expiryKey = KEYS[2]
        local expiryScore = tonumber(ARGV[1])

        -- ARGV[2]부터 field, value 쌍이 순서대로 들어옴
        for i = 2, #ARGV, 2 do
          local field = ARGV[i]
          local value = ARGV[i + 1]
          redis.call('HSET', hashKey, field, value)
          redis.call('ZADD', expiryKey, expiryScore, field)
        end
        return 1
      `;
      await this.redis.eval(script, 2, hashKey, expiryKey, expiryScore, ...args);
    });
  }

  /**
   * 병합 완료 후 Redis 정리를 원자적으로 수행합니다.
   * 1. mergeHashKey, mergeExpiryKey에서 sourceIds 삭제
   * 2. addHashKey, addExpiryKey에서 sourceIds 삭제 (임시 화자였을 경우)
   * 3. merge 키에 남은 데이터가 없으면 키 자체 삭제
   * 4. add 키에 남은 데이터가 없으면 키 자체 삭제
   *
   * 모든 키는 같은 hash slot에 있어야 합니다 (Redis 클러스터 호환).
   * @returns 남은 데이터 수
   */
  async cleanupAfterMerge(
    mergeHashKey: string,
    mergeExpiryKey: string,
    addHashKey: string,
    addExpiryKey: string,
    sourceIds: string[],
  ): Promise<number> {
    return this.executeWithErrorHandling('CLEANUP_AFTER_MERGE', mergeHashKey, async () => {
      const script = `
        local mergeHashKey = KEYS[1]
        local mergeExpiryKey = KEYS[2]
        local addHashKey = KEYS[3]
        local addExpiryKey = KEYS[4]

        -- sourceIds는 ARGV로 전달됨
        for i = 1, #ARGV do
          local sourceId = ARGV[i]
          -- merge 키에서 삭제
          redis.call('HDEL', mergeHashKey, sourceId)
          redis.call('ZREM', mergeExpiryKey, sourceId)
          -- add 키에서도 삭제 (임시 화자였을 경우)
          redis.call('HDEL', addHashKey, sourceId)
          redis.call('ZREM', addExpiryKey, sourceId)
        end

        -- 남은 데이터 확인
        local remainingCount = redis.call('ZCARD', mergeExpiryKey)
        if remainingCount == 0 then
          redis.call('DEL', mergeHashKey)
          redis.call('DEL', mergeExpiryKey)
        end

        -- add 키도 비었으면 삭제
        local addRemainingCount = redis.call('ZCARD', addExpiryKey)
        if addRemainingCount == 0 then
          redis.call('DEL', addHashKey)
          redis.call('DEL', addExpiryKey)
        end

        return remainingCount
      `;
      const result = await this.redis.eval(
        script,
        4,
        mergeHashKey,
        mergeExpiryKey,
        addHashKey,
        addExpiryKey,
        ...sourceIds,
      );
      return result as number;
    });
  }

  /**
   * 분산 락을 시도합니다. (SET key value NX EX ttl)
   * @param key 락 키
   * @param value 락을 소유한 인스턴스의 ID
   * @param ttl 락의 TTL (초)
   * @returns 락 획득 성공 시 true, 실패 시 false
   */
  async acquireLock(key: string, value: string, ttl: number): Promise<boolean> {
    return this.executeWithErrorHandling('ACQUIRE_LOCK', key, async () => {
      const result = await this.redis.set(key, value, 'EX', ttl, 'NX');
      return result === 'OK';
    });
  }

  /**
   * 분산 락을 해제합니다. (소유자일 경우에만 삭제)
   * Lua 스크립트를 사용하여 원자적으로 소유권을 확인하고 삭제합니다.
   */
  async releaseLock(key: string, value: string): Promise<void> {
    return this.executeWithErrorHandling('RELEASE_LOCK', key, async () => {
      // Lua 스크립트: 키의 값이 일치할 때만 삭제
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      await this.redis.eval(script, 1, key, value);
    });
  }

  /**
   * 락을 소유한 인스턴스일 때만 TTL을 연장합니다. (owner-checked, Lua 원자 실행)
   * 실행이 원래 TTL을 초과할 때 락이 만료돼 다른 인스턴스가 동시 실행하는 것을 막는다.
   * @returns 연장 성공(소유 중) 시 true, 소유하지 않아 연장 안 함 시 false
   */
  async refreshLock(key: string, value: string, ttl: number): Promise<boolean> {
    return this.executeWithErrorHandling('REFRESH_LOCK', key, async () => {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      const result = await this.redis.eval(script, 1, key, value, String(ttl));
      return result === 1;
    });
  }

  /**
   * 값이 기대값과 같을 때만 삭제 (compare-and-delete, Lua 원자 실행).
   * 스케줄러의 read → DB 저장 → delete 사이에 사용자가 새 편집을 써넣은 경우,
   * 그 최신 값을 지우지 않고 남겨 다음 주기에 저장되도록 한다.
   * @returns 삭제했으면 true, 값이 달라져(새 편집) 남겨뒀으면 false
   */
  async deleteIfEquals(key: string, expectedValue: string): Promise<boolean> {
    return this.executeWithErrorHandling('DELETE_IF_EQUALS', key, async () => {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await this.redis.eval(script, 1, key, expectedValue);
      return result === 1;
    });
  }

  /**
   * M9: 화자 저장 경로의 compare-and-delete (HASH + ZSET, Lua 원자 실행).
   * 스케줄러가 만료 대상 화자 id를 스냅샷 → DB 저장하는 사이 사용자가 같은 화자를
   * 재편집하면 ZSET score가 만료범위 밖(now+TTL)으로 갱신된다. 저장 후 삭제 시 score가
   * 여전히 threshold 이하(=재편집 안 됨)인 멤버만 ZSET·HASH에서 원자적으로 제거해,
   * 재편집된 최신 값이 유실되지 않고 다음 주기에 저장되도록 한다.
   * @returns 실제로 제거된 멤버 id 목록
   */
  async removeMembersIfScoreAtMost(
    expiryKey: string,
    hashKey: string,
    members: string[],
    threshold: number,
  ): Promise<string[]> {
    if (members.length === 0) {
      return [];
    }
    return this.executeWithErrorHandling('REMOVE_IF_SCORE_ATMOST', expiryKey, async () => {
      const script = `
        local threshold = tonumber(ARGV[1])
        local removed = {}
        for i = 2, #ARGV do
          local m = ARGV[i]
          local s = redis.call('ZSCORE', KEYS[1], m)
          if s and tonumber(s) <= threshold then
            redis.call('ZREM', KEYS[1], m)
            redis.call('HDEL', KEYS[2], m)
            removed[#removed + 1] = m
          end
        end
        return removed
      `;
      const result = (await this.redis.eval(
        script,
        2,
        expiryKey,
        hashKey,
        String(threshold),
        ...members,
      )) as string[];
      return result;
    });
  }

  // Pub/Sub - 메시지 발행
  async publish(channel: string, message: string): Promise<number> {
    return this.executeWithErrorHandling('PUBLISH', channel, () => this.publisher.publish(channel, message));
  }

  // Pub/Sub - 채널 구독
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.messageHandlers.set(channel, callback);
  }

  // Pub/Sub - 채널 구독 해제
  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
    this.messageHandlers.delete(channel);
  }

  // 패턴 구독 (여러 채널을 패턴으로 구독)
  async psubscribe(pattern: string, callback: (channel: string, message: string) => void): Promise<void> {
    await this.subscriber.psubscribe(pattern);
    this.pmessageHandlers.set(pattern, callback);
  }

  // 패턴 구독 해제
  async punsubscribe(pattern: string): Promise<void> {
    await this.subscriber.punsubscribe(pattern);
    this.pmessageHandlers.delete(pattern);
  }

  // single listeners 등록 (생성자 또는 초기화 시 한 번만 등록)
  private initListeners() {
    if (this.listenersInitialized) return;
    this.listenersInitialized = true;

    // 메시지 핸들러 (에러 처리 포함)
    this.subscriber.on('message', (chan: string, message: string) => {
      const handler = this.messageHandlers.get(chan);
      if (handler) {
        try {
          handler(message);
        } catch (error) {
          this.logger.error(`Error in message handler for channel "${chan}":`, error);
        }
      }
    });

    // 패턴 메시지 핸들러 (에러 처리 포함)
    this.subscriber.on('pmessage', (pattern: string, chan: string, message: string) => {
      const handler = this.pmessageHandlers.get(pattern);
      if (handler) {
        try {
          handler(chan, message);
        } catch (error) {
          this.logger.error(`Error in pmessage handler for pattern "${pattern}", channel "${chan}":`, error);
        }
      }
    });

    // Redis subscriber 연결 에러 핸들러
    this.subscriber.on('error', (error) => {
      this.logger.error('Redis subscriber connection error:', error);
    });

    // Redis publisher 연결 에러 핸들러
    this.publisher.on('error', (error) => {
      this.logger.error('Redis publisher connection error:', error);
    });

    // 연결 복구 로깅
    this.subscriber.on('ready', () => {
      this.logger.log('Redis subscriber connection ready');
    });

    this.publisher.on('ready', () => {
      this.logger.log('Redis publisher connection ready');
    });
  }
}
