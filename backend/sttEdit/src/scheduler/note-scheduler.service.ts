import { HttpException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../redis/redis.service';
import { randomUUID } from 'crypto';
import { NoteService } from '../note/note.service';
import { ErrorCode } from '../common/error-code.enum';
import { Constants } from '../common/constants.enum';
import { NOTE_EVENTS, NoteSavedEvent, NoteErrorEvent, NoteDataType } from '../events/note.events';
import { PrometheusService } from '../monitoring/prometheus.service';

/**
 * 재시도 가능한 에러인지 판별
 * - NotFoundException, TypeError, ReferenceError → 재시도 불필요 (프로그래밍 오류 또는 데이터 없음)
 * - 데이터 검증 실패 메시지 포함 시 → 재시도 불필요
 * - 기타 에러 (DB 연결, 네트워크 등) → 재시도 가능
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof NotFoundException) {
    return false; // 데이터가 없으면 재시도해도 없음
  }
  if (error instanceof HttpException && error.getStatus() < 500) {
    return false; // 4xx 계열(권한 없음·삭제된 노트·형식 오류)은 재시도해도 해결되지 않음
  }
  if (error instanceof TypeError || error instanceof ReferenceError) {
    return false; // 프로그래밍 오류는 재시도해도 해결되지 않음
  }
  if (error instanceof Error) {
    // 일반 Error는 보통 데이터 검증 실패 (잘못된 키 포맷, 필수 필드 누락 등)
    // 메시지에 "Invalid", "missing", "not found", "permission" 등이 포함되면 재시도 불필요
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid') || msg.includes('missing') || msg.includes('not found') || msg.includes('permission')) {
      return false;
    }
  }
  return true; // DB 연결, 트랜잭션 실패 등은 재시도 가능
}

@Injectable()
export class NoteSchedulerService {
  private readonly logger = new Logger(NoteSchedulerService.name);
  private readonly serverId = randomUUID(); // 각 서버 인스턴스를 식별하기 위한 고유 ID

  constructor(
    private readonly redisService: RedisService,
    private readonly noteService: NoteService,
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly prometheusService?: PrometheusService,
  ) {}

  /**
   * 재시도 횟수를 확인하고 증가시킵니다.
   * @returns canRetry: 재시도 가능 여부, retryCount: 현재 재시도 횟수
   */
  private async checkAndIncrementRetryCount(key: string): Promise<{ canRetry: boolean; retryCount: number }> {
    const retryKey = `retry:${key}`;
    try {
      const count = await this.redisService.incr(retryKey);

      // 첫 번째 증가 시 TTL 설정
      if (count === 1) {
        await this.redisService.expire(retryKey, Constants.RETRY_COUNT_TTL_SECONDS);
      }

      return {
        canRetry: count <= Constants.MAX_RETRY_COUNT,
        retryCount: count,
      };
    } catch (error) {
      // Redis 에러 시 재시도 허용 (보수적 접근)
      this.logger.warn(`Failed to check retry count for ${key}, allowing retry:`, error);
      return { canRetry: true, retryCount: 0 };
    }
  }

  /**
   * 재시도 카운터를 삭제합니다.
   */
  private async clearRetryCount(key: string): Promise<void> {
    try {
      await this.redisService.del(`retry:${key}`);
    } catch (error) {
      this.logger.warn(`Failed to clear retry count for ${key}:`, error);
    }
  }

  @Interval(60000) // 60초(1분)마다 실행
  async handleNoteDataLogging() {
    const lockAcquired = await this.redisService.acquireLock(Constants.SCHEDULER_LOCK_KEY, this.serverId, Constants.SCHEDULER_LOCK_TTL);

    if (!lockAcquired) {
      return; // 락 획득에 실패하면 즉시 종료
    }

    const startTime = Date.now();
    let noteDataSuccess = true;
    let speakerSuccess = true;

    // R2: 실행이 SCHEDULER_LOCK_TTL을 초과하면 락이 만료돼 다음 틱이 같은 키에 동시
    // 2차 패스를 실행한다(화자 경로에서 중복 삭제·유실 유발). 실행 중 락을 주기적으로
    // (TTL의 약 절반 간격) 갱신해 이를 막는다. 인스턴스가 죽으면 갱신이 멈춰 TTL 후
    // 락이 자동 해제돼 다른 인스턴스가 인계받는다. 갱신 실패(Redis 오류)는 삼켜서
    // interval 콜백의 미처리 거부가 exitOnError로 확대되지 않게 한다.
    const refreshMs =
      Math.max(1, Math.floor(Number(Constants.SCHEDULER_LOCK_TTL) / 2)) * 1000;
    const lockRefresh = setInterval(() => {
      void this.redisService
        .refreshLock(
          Constants.SCHEDULER_LOCK_KEY,
          this.serverId,
          Constants.SCHEDULER_LOCK_TTL,
        )
        .catch((e) =>
          this.logger.warn(`Scheduler lock refresh failed: ${(e as Error)?.message}`),
        );
    }, refreshMs);

    try {
      // 기존 노트 데이터 처리 (segment, summary, keywords 등)
      const noteDataStartTime = Date.now();
      try {
        await this.processNoteDataIndex();
        const noteDataDuration = (Date.now() - noteDataStartTime) / 1000;
        this.prometheusService?.recordSchedulerSync('note_data', true, noteDataDuration);
      } catch (error) {
        noteDataSuccess = false;
        const noteDataDuration = (Date.now() - noteDataStartTime) / 1000;
        this.prometheusService?.recordSchedulerSync('note_data', false, noteDataDuration);
        throw error;
      }

      // 임시 화자 처리 (별도 인덱스: note:speaker:index)
      const speakerStartTime = Date.now();
      try {
        await this.processSpeakerIndex();
        const speakerDuration = (Date.now() - speakerStartTime) / 1000;
        this.prometheusService?.recordSchedulerSync('speaker', true, speakerDuration);
      } catch (error) {
        speakerSuccess = false;
        const speakerDuration = (Date.now() - speakerStartTime) / 1000;
        this.prometheusService?.recordSchedulerSync('speaker', false, speakerDuration);
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `Error during scheduled note data logging: ${error.message}`,
        error.stack,
      );
    } finally {
      clearInterval(lockRefresh);
      await this.redisService.releaseLock(Constants.SCHEDULER_LOCK_KEY, this.serverId);
    }
  }

  /**
   * 기존 노트 데이터 인덱스 처리 (note:index)
   */
  private async processNoteDataIndex(): Promise<void> {
    const noteIds = await this.redisService.smembers('note:index');

    if (noteIds.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      noteIds.map(async (noteId) => {
        const hasData = await this.processNoteData(noteId);
        return { noteId, hasData };
      }),
    );

    const noteIdsToRemove: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { noteId, hasData } = result.value;
        if (!hasData) {
          noteIdsToRemove.push(noteId);
        }
      } else {
        const noteId = noteIds[index];
        this.logger.error(`Error processing noteId ${noteId}:`, result.reason);
        this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.DB_UPDATE_FAILURE));
      }
    });

    if (noteIdsToRemove.length > 0) {
      await this.redisService.srem('note:index', noteIdsToRemove);
    }
  }

  /**
   * 화자 관련 인덱스 처리 (note:speaker:index)
   * - 화자 추가 (add) → segment speaker 변경 순서로 처리
   * - note:index와 별도로 관리하여 기존 데이터 스케줄러와의 간섭을 방지
   */
  private async processSpeakerIndex(): Promise<void> {
    const noteIds = await this.redisService.smembers('note:speaker:index');

    if (noteIds.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      noteIds.map(async (noteId) => {
        // 편집자(노트 소유자)를 노트별 updater 키에서 조회해 각 DB 기록에 전달.
        // SQL WHERE의 user_id 강제에 사용된다(없으면 speaker 함수가 필수값 누락으로 폐기).
        const updatedBy = (await this.redisService.get(`note:{${noteId}}:speaker:updater`)) ?? undefined;

        // 1. 화자 추가 먼저 처리 (의존성: segment speaker가 새 화자를 참조할 수 있음)
        const addResult = await this.processAddSpeakerData(noteId, updatedBy);

        // 2. segment speaker 처리
        const segmentResult = await this.processSegmentSpeakerData(noteId, updatedBy);

        // 3. 화자 병합 처리
        const mergeResult = await this.processMergeSpeakerData(noteId, updatedBy);

        // 4. 화자명 변경 처리 (마지막: add, segment, merge 처리 후 alias)
        const aliasResult = await this.processAliasSpeakerData(noteId, updatedBy);

        // 하나라도 저장되면 SAVED 이벤트 발생
        if (addResult.saved || segmentResult.saved || mergeResult.saved || aliasResult.saved) {
          this.eventEmitter.emit(NOTE_EVENTS.SAVED, new NoteSavedEvent(noteId));
        }

        return {
          noteId,
          hasData: addResult.hasData || segmentResult.hasData || mergeResult.hasData || aliasResult.hasData,
        };
      }),
    );

    const noteIdsToRemove: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (!result.value.hasData) {
          noteIdsToRemove.push(result.value.noteId);
        }
      } else {
        this.logger.error(`Error processing speakers for noteId ${noteIds[index]}:`, result.reason);
      }
    });

    if (noteIdsToRemove.length > 0) {
      await this.redisService.srem('note:speaker:index', noteIdsToRemove);
      // 화자 데이터가 모두 소진된 노트는 updater 키도 함께 정리(잔여 방지).
      await Promise.all(
        noteIdsToRemove.map((noteId) =>
          this.redisService.del(`note:{${noteId}}:speaker:updater`),
        ),
      );
    }
  }

  /**
   * 특정 noteId의 모든 데이터를 처리 (병렬)
   * @param noteId
   * @returns note에 데이터가 하나라도 남아있으면 true, 모두 없으면 false
   */
  private async processNoteData(noteId: string): Promise<boolean> {
    // 모든 데이터 타입을 병렬로 처리
    const singleKeyTypes = ['keywords', 'next_action', 'main_topic'] as const;

    const results = await Promise.allSettled([
      // 1. Segment 데이터 처리
      this.processSegmentData(noteId).then(async (savedCount) => {
        const size = await this.redisService.scard(`note:{${noteId}}:segment:index`);
        if (size === 0) {
          await this.redisService.del(`note:{${noteId}}:segment:index`);
        }
        return { hasData: size > 0, savedCount };
      }),
      // 2. Summary Text 데이터 처리
      this.processSummaryTextData(noteId).then(async (savedCount) => {
        const size = await this.redisService.scard(`note:{${noteId}}:summary_text:index`);
        if (size === 0) {
          await this.redisService.del(`note:{${noteId}}:summary_text:index`);
        }
        return { hasData: size > 0, savedCount };
      }),
      // 3. 단일 키 처리 (keywords, next_action, main_topic)
      ...singleKeyTypes.map((type) => {
        const key = `note:{${noteId}}:${type}`;
        return this.processSingleKey(noteId, key, type);
      }),
    ]);

    // 결과 처리: 저장된 개수와 남은 데이터 여부 확인
    let hasRemainingData = false;
    let totalSavedCount = 0;
    const typeNames = ['segment', 'summary_text', ...singleKeyTypes];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const value = result.value;
        if ('savedCount' in value) {
          totalSavedCount += value.savedCount;
          if (value.hasData) hasRemainingData = true;
        } else {
          if (value.saved) totalSavedCount++;
          if (value.hasData) hasRemainingData = true;
        }
      } else {
        this.logger.error(`Failed to process ${typeNames[index]} for noteId ${noteId}:`, result.reason);
        hasRemainingData = true;
      }
    });

    // 저장된 데이터가 있으면 한 번만 이벤트 발생
    if (totalSavedCount > 0) {
      this.eventEmitter.emit(NOTE_EVENTS.SAVED, new NoteSavedEvent(noteId));
    }

    return hasRemainingData;
  }

  /**
   * Segment 데이터 처리 (병렬)
   * @returns 저장된 segment 개수
   */
  private async processSegmentData(noteId: string): Promise<number> {
    const segmentIds = await this.redisService.smembers(`note:{${noteId}}:segment:index`);
    if (segmentIds.length === 0) return 0;

    const results = await Promise.allSettled(
      segmentIds.map(async (segmentId) => {
        const key = `note:{${noteId}}:segment:${segmentId}`;

        // 키 존재 여부 확인
        const exists = await this.redisService.exists(key);
        if (!exists) {
          return { segmentId, shouldRemove: true };
        }

        // TTL 확인: -2(만료됨), -1(TTL없음), 0 < ttl < threshold(저장 대상)
        const ttl = await this.redisService.ttl(key);

        // TTL이 -2(이미 만료) 또는 -1(TTL 없음)인 경우: 오래된 데이터이므로 폐기
        if (ttl === -2 || ttl === -1) {
          this.logger.warn(`Discarding stale segment data ${key} (ttl: ${ttl})`);
          await this.redisService.del(key);
          await this.clearRetryCount(key);
          return { segmentId, shouldRemove: true, saved: false };
        }

        // TTL이 60초 미만인 경우: DB에 저장
        if (ttl > 0 && ttl < Constants.TTL_THRESHOLD_SECONDS) {
          const value = await this.redisService.get(key);
          if (value) {
            let parsedValue: { updatedBy?: string; payload?: any } | null = null;
            try {
              parsedValue = JSON.parse(value);
            } catch {
              // JSON 파싱 실패 시 무시
            }
            try {
              await this.noteService.updateSegmentFromRedis(key, value);
              // read→저장→삭제 사이에 새 편집이 써졌으면 지우지 않고 다음 주기에 저장 (CAS)
              const deleted = await this.redisService.deleteIfEquals(key, value);
              if (deleted) {
                await this.clearRetryCount(key);
              } else {
                this.logger.log(`Segment ${key} was re-edited during save; keeping newer value for next cycle`);
              }
              this.prometheusService?.recordNoteSave('segment', true);
              return { segmentId, shouldRemove: deleted, saved: true };
            } catch (error) {
              this.prometheusService?.recordNoteSave('segment', false);
              this.logger.error(`Failed to update segment ${key}, userId: ${parsedValue?.updatedBy}, payloadChars: ${JSON.stringify(parsedValue?.payload)?.length ?? 0}`, error);
              if (isRetryableError(error)) {
                // 재시도 횟수 확인
                const { canRetry, retryCount } = await this.checkAndIncrementRetryCount(key);
                if (canRetry) {
                  // 일시적 에러: TTL 연장하여 다음 주기에 재시도
                  this.logger.warn(`Retrying segment ${key} (attempt ${retryCount}/${Constants.MAX_RETRY_COUNT})`);
                  await this.redisService.expire(key, Constants.TTL_EXTENSION_SECONDS);
                  return { segmentId, shouldRemove: false, saved: false };
                } else {
                  // 최대 재시도 횟수 초과: 포기
                  this.logger.error(`Max retries exceeded for segment ${key}, giving up`);
                  await this.redisService.del(key);
                  await this.clearRetryCount(key);
                  this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.MAX_RETRY_EXCEEDED, 'segment'));
                  return { segmentId, shouldRemove: true, saved: false };
                }
              } else {
                // 영구적 에러: 키 삭제하고 실패 처리
                this.logger.warn(`Permanent error for segment ${key}, removing from Redis`);
                await this.redisService.del(key);
                await this.clearRetryCount(key);
                this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.DB_UPDATE_FAILURE, 'segment'));
                return { segmentId, shouldRemove: true, saved: false };
              }
            }
          }
        }

        return { segmentId, shouldRemove: false, saved: false };
      }),
    );

    // 결과에서 제거할 segmentId 수집 및 저장된 개수 확인
    let savedCount = 0;
    const toRemove = results
      .filter((r): r is PromiseFulfilledResult<{ segmentId: string; shouldRemove: boolean; saved?: boolean }> =>
        r.status === 'fulfilled' && r.value.shouldRemove)
      .map((r) => {
        if (r.value.saved) savedCount++;
        return r.value.segmentId;
      });

    if (toRemove.length > 0) {
      await this.redisService.srem(`note:{${noteId}}:segment:index`, toRemove);
    }

    return savedCount;
  }

  /**
   * Summary Text 데이터 처리 (병렬)
   * @returns 저장된 section 개수
   */
  private async processSummaryTextData(noteId: string): Promise<number> {
    const sectionIds = await this.redisService.smembers(`note:{${noteId}}:summary_text:index`);
    if (sectionIds.length === 0) return 0;

    const results = await Promise.allSettled(
      sectionIds.map(async (sectionId) => {
        const key = `note:{${noteId}}:summary_text:${sectionId}`;

        // 키 존재 여부 확인
        const exists = await this.redisService.exists(key);
        if (!exists) {
          return { sectionId, shouldRemove: true };
        }

        // TTL 확인: -2(만료됨), -1(TTL없음), 0 < ttl < threshold(저장 대상)
        const ttl = await this.redisService.ttl(key);

        // TTL이 -2(이미 만료) 또는 -1(TTL 없음)인 경우: 오래된 데이터이므로 폐기
        if (ttl === -2 || ttl === -1) {
          this.logger.warn(`Discarding stale summary_text data ${key} (ttl: ${ttl})`);
          await this.redisService.del(key);
          await this.clearRetryCount(key);
          return { sectionId, shouldRemove: true, saved: false };
        }

        // TTL이 60초 미만인 경우: DB에 저장
        if (ttl > 0 && ttl < Constants.TTL_THRESHOLD_SECONDS) {
          const value = await this.redisService.get(key);
          if (value) {
            let parsedValue: { updatedBy?: string; payload?: any } | null = null;
            try {
              parsedValue = JSON.parse(value);
            } catch {
              // JSON 파싱 실패 시 무시
            }
            try {
              await this.noteService.updateSummaryTextFromRedis(key, value);
              // read→저장→삭제 사이에 새 편집이 써졌으면 지우지 않고 다음 주기에 저장 (CAS)
              const deleted = await this.redisService.deleteIfEquals(key, value);
              if (deleted) {
                await this.clearRetryCount(key);
              } else {
                this.logger.log(`Summary text ${key} was re-edited during save; keeping newer value for next cycle`);
              }
              this.prometheusService?.recordNoteSave('summary_text', true);
              return { sectionId, shouldRemove: deleted, saved: true };
            } catch (error) {
              this.prometheusService?.recordNoteSave('summary_text', false);
              this.logger.error(`Failed to update summary_text ${key}, userId: ${parsedValue?.updatedBy}, payloadChars: ${JSON.stringify(parsedValue?.payload)?.length ?? 0}`, error);
              if (isRetryableError(error)) {
                // 재시도 횟수 확인
                const { canRetry, retryCount } = await this.checkAndIncrementRetryCount(key);
                if (canRetry) {
                  // 일시적 에러: TTL 연장하여 다음 주기에 재시도
                  this.logger.warn(`Retrying summary_text ${key} (attempt ${retryCount}/${Constants.MAX_RETRY_COUNT})`);
                  await this.redisService.expire(key, Constants.TTL_EXTENSION_SECONDS);
                  return { sectionId, shouldRemove: false, saved: false };
                } else {
                  // 최대 재시도 횟수 초과: 포기
                  this.logger.error(`Max retries exceeded for summary_text ${key}, giving up`);
                  await this.redisService.del(key);
                  await this.clearRetryCount(key);
                  this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.MAX_RETRY_EXCEEDED, 'summary_text'));
                  return { sectionId, shouldRemove: true, saved: false };
                }
              } else {
                // 영구적 에러: 키 삭제하고 실패 처리
                this.logger.warn(`Permanent error for summary_text ${key}, removing from Redis`);
                await this.redisService.del(key);
                await this.clearRetryCount(key);
                this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.DB_UPDATE_FAILURE, 'summary_text'));
                return { sectionId, shouldRemove: true, saved: false };
              }
            }
          }
        }

        return { sectionId, shouldRemove: false, saved: false };
      }),
    );

    // 결과에서 제거할 sectionId 수집 및 저장된 개수 확인
    let savedCount = 0;
    const toRemove = results
      .filter((r): r is PromiseFulfilledResult<{ sectionId: string; shouldRemove: boolean; saved?: boolean }> =>
        r.status === 'fulfilled' && r.value.shouldRemove)
      .map((r) => {
        if (r.value.saved) savedCount++;
        return r.value.sectionId;
      });

    if (toRemove.length > 0) {
      await this.redisService.srem(`note:{${noteId}}:summary_text:index`, toRemove);
    }

    return savedCount;
  }

  /**
   * 단일 키 처리 (keywords, next_action, main_topic)
   * @returns { hasData: 키가 존재하면 true, saved: 저장 성공 시 true }
   */
  private async processSingleKey(noteId: string, key: string, type: NoteDataType): Promise<{ hasData: boolean; saved: boolean }> {
    const exists = await this.redisService.exists(key);
    if (!exists) {
      return { hasData: false, saved: false };
    }

    const ttl = await this.redisService.ttl(key);

    // TTL이 -2(이미 만료) 또는 -1(TTL 없음)인 경우: 오래된 데이터이므로 폐기
    if (ttl === -2 || ttl === -1) {
      this.logger.warn(`Discarding stale ${type} data ${key} (ttl: ${ttl})`);
      await this.redisService.del(key);
      await this.clearRetryCount(key);
      return { hasData: false, saved: false };
    }

    // TTL이 60초 미만인 경우: DB에 저장
    if (ttl > 0 && ttl < Constants.TTL_THRESHOLD_SECONDS) {
      const value = await this.redisService.get(key);
      if (value) {
        let parsedValue: { updatedBy?: string; payload?: any } | null = null;
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // JSON 파싱 실패 시 무시
        }
        try {
          await this.noteService.updateSummaryFromRedis(key, value);
          // read→저장→삭제 사이에 새 편집이 써졌으면 지우지 않고 다음 주기에 저장 (CAS)
          const deleted = await this.redisService.deleteIfEquals(key, value);
          if (deleted) {
            await this.clearRetryCount(key);
          } else {
            this.logger.log(`${type} ${key} was re-edited during save; keeping newer value for next cycle`);
          }
          return { hasData: !deleted, saved: true };
        } catch (error) {
          this.logger.error(`Failed to update ${type} ${key}, userId: ${parsedValue?.updatedBy}, payloadChars: ${JSON.stringify(parsedValue?.payload)?.length ?? 0}`, error);
          if (isRetryableError(error)) {
            // 재시도 횟수 확인
            const { canRetry, retryCount } = await this.checkAndIncrementRetryCount(key);
            if (canRetry) {
              // 일시적 에러: TTL 연장하여 다음 주기에 재시도
              this.logger.warn(`Retrying ${type} ${key} (attempt ${retryCount}/${Constants.MAX_RETRY_COUNT})`);
              await this.redisService.expire(key, Constants.TTL_EXTENSION_SECONDS);
              return { hasData: true, saved: false }; // 에러 발생했지만 키는 여전히 존재
            } else {
              // 최대 재시도 횟수 초과: 포기
              this.logger.error(`Max retries exceeded for ${type} ${key}, giving up`);
              await this.redisService.del(key);
              await this.clearRetryCount(key);
              this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.MAX_RETRY_EXCEEDED, type));
              return { hasData: false, saved: false }; // 키 삭제됨
            }
          } else {
            // 영구적 에러: 키 삭제하고 실패 처리
            this.logger.warn(`Permanent error for ${type} ${key}, removing from Redis`);
            await this.redisService.del(key);
            await this.clearRetryCount(key);
            this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.DB_UPDATE_FAILURE, type));
            return { hasData: false, saved: false }; // 키 삭제됨
          }
        }
      }
    }

    return { hasData: true, saved: false }; // 키가 존재하고 아직 처리 시간이 아님
  }

  /**
   * 화자 추가 만료 처리 (HASH + ZSET 조합)
   * TTL 60초 미만인 화자를 DB에 저장(정식 승격) 후 Redis에서 삭제
   * @returns { hasData: HASH에 데이터가 남아있으면 true, saved: DB 저장 성공 시 true }
   */
  private async processAddSpeakerData(noteId: string, updatedBy?: string): Promise<{ hasData: boolean; saved: boolean }> {
    const hashKey = `note:{${noteId}}:speaker:add`;
    const expiryKey = `note:{${noteId}}:speaker:add:expiry`;

    // ZSET 존재 여부 확인
    const expiryCount = await this.redisService.zcard(expiryKey);
    if (expiryCount === 0) {
      // ZSET이 비어있으면 HASH도 정리 (고아 데이터 폐기)
      const hashData = await this.redisService.hgetall(hashKey);
      if (Object.keys(hashData).length > 0) {
        this.logger.warn(`Discarding orphan speaker:add data for note ${noteId} (no expiry ZSET)`);
        await this.redisService.del(hashKey);
      }
      await this.redisService.del(expiryKey);
      return { hasData: false, saved: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const threshold = now + Constants.TTL_THRESHOLD_SECONDS;

    // 1. 이미 만료된 데이터 폐기 (score < now)
    const expiredSpeakerIds = await this.redisService.zrangebyscore(expiryKey, 0, now - 1);
    if (expiredSpeakerIds.length > 0) {
      this.logger.warn(`Discarding ${expiredSpeakerIds.length} expired speaker:add data for note ${noteId}`);
      await this.redisService.hdel(hashKey, expiredSpeakerIds);
      await this.redisService.zrem(expiryKey, expiredSpeakerIds);
    }

    // 2. TTL 60초 미만인 speakerId 조회 (now <= score < threshold) - 저장 대상
    const expiringSpeakerIds = await this.redisService.zrangebyscore(expiryKey, now, threshold);

    if (expiringSpeakerIds.length === 0) {
      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }
      return { hasData: remainingCount > 0, saved: false };
    }

    // HASH에서 만료 대상 화자의 name 일괄 조회
    const speakersToSave: Record<string, string> = {};
    const names = await this.redisService.hmget(hashKey, expiringSpeakerIds);
    expiringSpeakerIds.forEach((speakerId, index) => {
      const name = names[index];
      if (name) {
        speakersToSave[speakerId] = name;
      }
    });

    // DB에 저장할 화자가 없으면 Redis 정리만 수행
    if (Object.keys(speakersToSave).length === 0) {
      await this.redisService.zrem(expiryKey, expiringSpeakerIds);
      await this.redisService.hdel(hashKey, expiringSpeakerIds);

      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }
      return { hasData: remainingCount > 0, saved: false };
    }

    // DB에 저장 (notes_note.speakers에 원자적 merge)
    try {
      await this.noteService.addSpeakersToNote(noteId, speakersToSave, updatedBy);

      // DB 저장 성공 → Redis에서 삭제 (M9: 저장 사이 재편집된 항목은 score가
      // threshold 밖으로 갱신되므로 보존하고, 여전히 만료범위인 것만 제거한다)
      await this.redisService.removeMembersIfScoreAtMost(
        expiryKey,
        hashKey,
        expiringSpeakerIds,
        threshold,
      );

      // 남은 데이터 확인
      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }

      return { hasData: remainingCount > 0, saved: true };
    } catch (error) {
      this.logger.error(`Failed to save temp speakers to DB for note ${noteId}:`, error);

      if (isRetryableError(error)) {
        // 재시도 가능: 개별 항목별로 재시도 횟수 확인
        const retryableSpeakerIds: string[] = [];
        const exceededSpeakerIds: string[] = [];

        for (const speakerId of expiringSpeakerIds) {
          const retryKey = `${hashKey}:${speakerId}`;
          const { canRetry, retryCount } = await this.checkAndIncrementRetryCount(retryKey);
          if (canRetry) {
            this.logger.warn(`Retrying speaker:add ${speakerId} in note ${noteId} (attempt ${retryCount}/${Constants.MAX_RETRY_COUNT})`);
            retryableSpeakerIds.push(speakerId);
          } else {
            this.logger.error(`Max retries exceeded for speaker:add ${speakerId} in note ${noteId}, giving up`);
            exceededSpeakerIds.push(speakerId);
            await this.clearRetryCount(retryKey);
          }
        }

        // 재시도 가능한 항목: TTL 연장
        if (retryableSpeakerIds.length > 0) {
          const extensionScore = Math.floor(Date.now() / 1000) + Constants.TTL_EXTENSION_SECONDS;
          for (const speakerId of retryableSpeakerIds) {
            await this.redisService.zadd(expiryKey, extensionScore, speakerId);
          }
        }

        // 최대 재시도 초과 항목: Redis에서 삭제
        if (exceededSpeakerIds.length > 0) {
          await this.redisService.hdel(hashKey, exceededSpeakerIds);
          await this.redisService.zrem(expiryKey, exceededSpeakerIds);
          this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.MAX_RETRY_EXCEEDED));
        }

        const remainingCount = await this.redisService.zcard(expiryKey);
        if (remainingCount === 0) {
          await this.redisService.del(hashKey);
          await this.redisService.del(expiryKey);
        }
        return { hasData: remainingCount > 0, saved: false };
      } else {
        // 영구적 에러: Redis에서 삭제하고 실패 처리
        this.logger.warn(`Permanent error for temp speakers in note ${noteId}, removing from Redis`);
        for (const speakerId of expiringSpeakerIds) {
          await this.clearRetryCount(`${hashKey}:${speakerId}`);
        }
        await this.redisService.hdel(hashKey, expiringSpeakerIds);
        await this.redisService.zrem(expiryKey, expiringSpeakerIds);
        this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.DB_UPDATE_FAILURE));

        const remainingCount = await this.redisService.zcard(expiryKey);
        if (remainingCount === 0) {
          await this.redisService.del(hashKey);
          await this.redisService.del(expiryKey);
        }
        return { hasData: remainingCount > 0, saved: false };
      }
    }
  }

  /**
   * segment speaker 변경 만료 처리 (HASH + ZSET 조합)
   * TTL 60초 미만인 segment speaker를 DB에 저장 후 Redis에서 삭제
   * @returns { hasData: HASH에 데이터가 남아있으면 true, saved: DB 저장 성공 시 true }
   */
  private async processSegmentSpeakerData(noteId: string, updatedBy?: string): Promise<{ hasData: boolean; saved: boolean }> {
    const hashKey = `note:{${noteId}}:speaker:segment`;
    const expiryKey = `note:{${noteId}}:speaker:segment:expiry`;

    // ZSET 존재 여부 확인
    const expiryCount = await this.redisService.zcard(expiryKey);
    if (expiryCount === 0) {
      // ZSET이 비어있으면 HASH도 정리 (고아 데이터 폐기)
      const hashData = await this.redisService.hgetall(hashKey);
      if (Object.keys(hashData).length > 0) {
        this.logger.warn(`Discarding orphan speaker:segment data for note ${noteId} (no expiry ZSET)`);
        await this.redisService.del(hashKey);
      }
      await this.redisService.del(expiryKey);
      return { hasData: false, saved: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const threshold = now + Constants.TTL_THRESHOLD_SECONDS;

    // 1. 이미 만료된 데이터 폐기 (score < now)
    const expiredSegmentIds = await this.redisService.zrangebyscore(expiryKey, 0, now - 1);
    if (expiredSegmentIds.length > 0) {
      this.logger.warn(`Discarding ${expiredSegmentIds.length} expired speaker:segment data for note ${noteId}`);
      await this.redisService.hdel(hashKey, expiredSegmentIds);
      await this.redisService.zrem(expiryKey, expiredSegmentIds);
    }

    // 2. TTL 60초 미만인 segmentId 조회 (now <= score < threshold) - 저장 대상
    const expiringSegmentIds = await this.redisService.zrangebyscore(expiryKey, now, threshold);

    if (expiringSegmentIds.length === 0) {
      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }
      return { hasData: remainingCount > 0, saved: false };
    }

    // HASH에서 만료 대상 segment의 speakerId 조회
    const segmentSpeakersToSave: Record<string, string> = {};
    for (const segmentId of expiringSegmentIds) {
      const speakerId = await this.redisService.hget(hashKey, segmentId);
      if (speakerId) {
        segmentSpeakersToSave[segmentId] = speakerId;
      }
    }

    // DB에 저장할 데이터가 없으면 Redis 정리만 수행
    if (Object.keys(segmentSpeakersToSave).length === 0) {
      await this.redisService.zrem(expiryKey, expiringSegmentIds);
      await this.redisService.hdel(hashKey, expiringSegmentIds);

      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }
      return { hasData: remainingCount > 0, saved: false };
    }

    // DB에 저장 (notes_note_segment.speaker 업데이트)
    try {
      await this.noteService.updateSegmentSpeakers(noteId, segmentSpeakersToSave, updatedBy);

      // DB 저장 성공 → Redis에서 삭제 (M9: 저장 사이 재편집된 항목은 score가
      // threshold 밖으로 갱신되므로 보존하고, 여전히 만료범위인 것만 제거한다)
      await this.redisService.removeMembersIfScoreAtMost(
        expiryKey,
        hashKey,
        expiringSegmentIds,
        threshold,
      );

      // 남은 데이터 확인
      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }

      return { hasData: remainingCount > 0, saved: true };
    } catch (error) {
      this.logger.error(`Failed to save segment speakers to DB for note ${noteId}:`, error);

      if (isRetryableError(error)) {
        // 재시도 가능: 개별 항목별로 재시도 횟수 확인
        const retryableSegmentIds: string[] = [];
        const exceededSegmentIds: string[] = [];

        for (const segmentId of expiringSegmentIds) {
          const retryKey = `${hashKey}:${segmentId}`;
          const { canRetry, retryCount } = await this.checkAndIncrementRetryCount(retryKey);
          if (canRetry) {
            this.logger.warn(`Retrying speaker:segment ${segmentId} in note ${noteId} (attempt ${retryCount}/${Constants.MAX_RETRY_COUNT})`);
            retryableSegmentIds.push(segmentId);
          } else {
            this.logger.error(`Max retries exceeded for speaker:segment ${segmentId} in note ${noteId}, giving up`);
            exceededSegmentIds.push(segmentId);
            await this.clearRetryCount(retryKey);
          }
        }

        // 재시도 가능한 항목: TTL 연장
        if (retryableSegmentIds.length > 0) {
          const extensionScore = Math.floor(Date.now() / 1000) + Constants.TTL_EXTENSION_SECONDS;
          for (const segmentId of retryableSegmentIds) {
            await this.redisService.zadd(expiryKey, extensionScore, segmentId);
          }
        }

        // 최대 재시도 초과 항목: Redis에서 삭제
        if (exceededSegmentIds.length > 0) {
          await this.redisService.hdel(hashKey, exceededSegmentIds);
          await this.redisService.zrem(expiryKey, exceededSegmentIds);
          this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.MAX_RETRY_EXCEEDED));
        }

        const remainingCount = await this.redisService.zcard(expiryKey);
        if (remainingCount === 0) {
          await this.redisService.del(hashKey);
          await this.redisService.del(expiryKey);
        }
        return { hasData: remainingCount > 0, saved: false };
      } else {
        // 영구적 에러: Redis에서 삭제하고 실패 처리
        this.logger.warn(`Permanent error for segment speakers in note ${noteId}, removing from Redis`);
        for (const segmentId of expiringSegmentIds) {
          await this.clearRetryCount(`${hashKey}:${segmentId}`);
        }
        await this.redisService.hdel(hashKey, expiringSegmentIds);
        await this.redisService.zrem(expiryKey, expiringSegmentIds);
        this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.DB_UPDATE_FAILURE));

        const remainingCount = await this.redisService.zcard(expiryKey);
        if (remainingCount === 0) {
          await this.redisService.del(hashKey);
          await this.redisService.del(expiryKey);
        }
        return { hasData: remainingCount > 0, saved: false };
      }
    }
  }

  /**
   * 화자 병합 만료 처리 (HASH + ZSET 조합)
   * TTL 60초 미만인 병합 데이터를 DB에 저장 후 Redis에서 삭제
   * - notes_note_segment.speaker 업데이트 (sourceId → targetId)
   * - notes_note.speakers에서 sourceId 제거
   * @returns { hasData: HASH에 데이터가 남아있으면 true, saved: DB 저장 성공 시 true }
   */
  private async processMergeSpeakerData(noteId: string, updatedBy?: string): Promise<{ hasData: boolean; saved: boolean }> {
    const hashKey = `note:{${noteId}}:speaker:merge`;
    const expiryKey = `note:{${noteId}}:speaker:merge:expiry`;

    // ZSET 존재 여부 확인
    const expiryCount = await this.redisService.zcard(expiryKey);
    if (expiryCount === 0) {
      // ZSET이 비어있으면 HASH도 정리 (고아 데이터 폐기)
      const hashData = await this.redisService.hgetall(hashKey);
      if (Object.keys(hashData).length > 0) {
        this.logger.warn(`Discarding orphan speaker:merge data for note ${noteId} (no expiry ZSET)`);
        await this.redisService.del(hashKey);
      }
      await this.redisService.del(expiryKey);
      return { hasData: false, saved: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const threshold = now + Constants.TTL_THRESHOLD_SECONDS;

    // 1. 이미 만료된 데이터 폐기 (score < now)
    const expiredSourceIds = await this.redisService.zrangebyscore(expiryKey, 0, now - 1);
    if (expiredSourceIds.length > 0) {
      this.logger.warn(`Discarding ${expiredSourceIds.length} expired speaker:merge data for note ${noteId}`);
      await this.redisService.hdel(hashKey, expiredSourceIds);
      await this.redisService.zrem(expiryKey, expiredSourceIds);
    }

    // 2. TTL 60초 미만인 sourceId 조회 (now <= score < threshold) - 저장 대상
    const expiringSourceIds = await this.redisService.zrangebyscore(expiryKey, now, threshold);

    if (expiringSourceIds.length === 0) {
      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }
      return { hasData: remainingCount > 0, saved: false };
    }

    // HASH에서 만료 대상 병합의 targetId 조회
    const mergesToSave: Record<string, string> = {};
    for (const sourceId of expiringSourceIds) {
      const targetId = await this.redisService.hget(hashKey, sourceId);
      if (targetId) {
        mergesToSave[sourceId] = targetId;
      }
    }

    // DB에 저장할 데이터가 없으면 Redis 정리만 수행
    if (Object.keys(mergesToSave).length === 0) {
      await this.redisService.zrem(expiryKey, expiringSourceIds);
      await this.redisService.hdel(hashKey, expiringSourceIds);

      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }
      return { hasData: remainingCount > 0, saved: false };
    }

    // DB에 저장 (segment speaker 변경 + speakers JSON에서 sourceId 제거)
    try {
      await this.noteService.mergeSpeakers(noteId, mergesToSave, updatedBy);

      // DB 저장 성공 → Redis에서 원자적으로 정리
      // (merge 키 삭제 + add 키에서 sourceId 삭제 + 빈 키 정리)
      const addHashKey = `note:{${noteId}}:speaker:add`;
      const addExpiryKey = `note:{${noteId}}:speaker:add:expiry`;
      const remainingCount = await this.redisService.cleanupAfterMerge(
        hashKey,
        expiryKey,
        addHashKey,
        addExpiryKey,
        expiringSourceIds,
      );

      return { hasData: remainingCount > 0, saved: true };
    } catch (error) {
      this.logger.error(`Failed to merge speakers to DB for note ${noteId}:`, error);

      if (isRetryableError(error)) {
        // 재시도 가능: 개별 항목별로 재시도 횟수 확인
        const retryableSourceIds: string[] = [];
        const exceededSourceIds: string[] = [];

        for (const sourceId of expiringSourceIds) {
          const retryKey = `${hashKey}:${sourceId}`;
          const { canRetry, retryCount } = await this.checkAndIncrementRetryCount(retryKey);
          if (canRetry) {
            this.logger.warn(`Retrying speaker:merge ${sourceId} in note ${noteId} (attempt ${retryCount}/${Constants.MAX_RETRY_COUNT})`);
            retryableSourceIds.push(sourceId);
          } else {
            this.logger.error(`Max retries exceeded for speaker:merge ${sourceId} in note ${noteId}, giving up`);
            exceededSourceIds.push(sourceId);
            await this.clearRetryCount(retryKey);
          }
        }

        // 재시도 가능한 항목: TTL 연장
        if (retryableSourceIds.length > 0) {
          const extensionScore = Math.floor(Date.now() / 1000) + Constants.TTL_EXTENSION_SECONDS;
          for (const sourceId of retryableSourceIds) {
            await this.redisService.zadd(expiryKey, extensionScore, sourceId);
          }
        }

        // 최대 재시도 초과 항목: Redis에서 삭제
        if (exceededSourceIds.length > 0) {
          await this.redisService.hdel(hashKey, exceededSourceIds);
          await this.redisService.zrem(expiryKey, exceededSourceIds);
          this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.MAX_RETRY_EXCEEDED));
        }

        const remainingCount = await this.redisService.zcard(expiryKey);
        if (remainingCount === 0) {
          await this.redisService.del(hashKey);
          await this.redisService.del(expiryKey);
        }
        return { hasData: remainingCount > 0, saved: false };
      } else {
        // 영구적 에러: Redis에서 삭제하고 실패 처리
        this.logger.warn(`Permanent error for merge speakers in note ${noteId}, removing from Redis`);
        for (const sourceId of expiringSourceIds) {
          await this.clearRetryCount(`${hashKey}:${sourceId}`);
        }
        await this.redisService.hdel(hashKey, expiringSourceIds);
        await this.redisService.zrem(expiryKey, expiringSourceIds);
        this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.DB_UPDATE_FAILURE));

        const remainingCount = await this.redisService.zcard(expiryKey);
        if (remainingCount === 0) {
          await this.redisService.del(hashKey);
          await this.redisService.del(expiryKey);
        }
        return { hasData: remainingCount > 0, saved: false };
      }
    }
  }

  /**
   * 화자명 변경 만료 처리 (HASH + ZSET 조합)
   * TTL 60초 미만인 alias 데이터를 DB에 저장 후 Redis에서 삭제
   * - notes_note.speakers에서 해당 speakerId의 name 업데이트
   * @returns { hasData: HASH에 데이터가 남아있으면 true, saved: DB 저장 성공 시 true }
   */
  private async processAliasSpeakerData(noteId: string, updatedBy?: string): Promise<{ hasData: boolean; saved: boolean }> {
    const hashKey = `note:{${noteId}}:speaker:alias`;
    const expiryKey = `note:{${noteId}}:speaker:alias:expiry`;

    // ZSET 존재 여부 확인
    const expiryCount = await this.redisService.zcard(expiryKey);
    if (expiryCount === 0) {
      // ZSET이 비어있으면 HASH도 정리 (고아 데이터 폐기)
      const hashData = await this.redisService.hgetall(hashKey);
      if (Object.keys(hashData).length > 0) {
        this.logger.warn(`Discarding orphan speaker:alias data for note ${noteId} (no expiry ZSET)`);
        await this.redisService.del(hashKey);
      }
      await this.redisService.del(expiryKey);
      return { hasData: false, saved: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const threshold = now + Constants.TTL_THRESHOLD_SECONDS;

    // 1. 이미 만료된 데이터 폐기 (score < now)
    const expiredSpeakerIds = await this.redisService.zrangebyscore(expiryKey, 0, now - 1);
    if (expiredSpeakerIds.length > 0) {
      this.logger.warn(`Discarding ${expiredSpeakerIds.length} expired speaker:alias data for note ${noteId}`);
      await this.redisService.hdel(hashKey, expiredSpeakerIds);
      await this.redisService.zrem(expiryKey, expiredSpeakerIds);
    }

    // 2. TTL 60초 미만인 speakerId 조회 (now <= score < threshold) - 저장 대상
    const expiringSpeakerIds = await this.redisService.zrangebyscore(expiryKey, now, threshold);

    if (expiringSpeakerIds.length === 0) {
      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }
      return { hasData: remainingCount > 0, saved: false };
    }

    // HASH에서 만료 대상 화자의 newName 조회
    const aliasesToSave: Record<string, string> = {};
    for (const speakerId of expiringSpeakerIds) {
      const newName = await this.redisService.hget(hashKey, speakerId);
      if (newName) {
        aliasesToSave[speakerId] = newName;
      }
    }

    // DB에 저장할 데이터가 없으면 Redis 정리만 수행
    if (Object.keys(aliasesToSave).length === 0) {
      await this.redisService.zrem(expiryKey, expiringSpeakerIds);
      await this.redisService.hdel(hashKey, expiringSpeakerIds);

      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }
      return { hasData: remainingCount > 0, saved: false };
    }

    // DB에 저장 (notes_note.speakers에서 name 업데이트)
    // updateSpeakerAlias 내부에서 speakers ? speakerId 조건으로 존재하는 화자만 업데이트 (TOCTOU 방지)
    try {
      const updatedSpeakerIds = await this.noteService.updateSpeakerAlias(noteId, aliasesToSave, updatedBy);

      // 스킵된 화자 로그 (병합으로 삭제된 화자)
      const skippedSpeakerIds = Object.keys(aliasesToSave).filter(
        (id) => !updatedSpeakerIds.includes(id),
      );
      if (skippedSpeakerIds.length > 0) {
        this.logger.warn(
          `Skipped alias update for non-existent speakers in note ${noteId}: ${skippedSpeakerIds.join(', ')}`,
        );
      }

      // DB 저장 성공 → Redis에서 삭제 (M9: 저장 사이 재편집된 항목은 score가
      // threshold 밖으로 갱신되므로 보존하고, 여전히 만료범위인 것만 제거한다)
      await this.redisService.removeMembersIfScoreAtMost(
        expiryKey,
        hashKey,
        expiringSpeakerIds,
        threshold,
      );

      // 남은 데이터 확인
      const remainingCount = await this.redisService.zcard(expiryKey);
      if (remainingCount === 0) {
        await this.redisService.del(hashKey);
        await this.redisService.del(expiryKey);
      }

      return { hasData: remainingCount > 0, saved: true };
    } catch (error) {
      this.logger.error(`Failed to update speaker alias to DB for note ${noteId}:`, error);

      if (isRetryableError(error)) {
        // 재시도 가능: ZSET score를 연장하여 다음 주기에 재시도
        const extensionScore = Math.floor(Date.now() / 1000) + Constants.TTL_EXTENSION_SECONDS;
        for (const speakerId of expiringSpeakerIds) {
          await this.redisService.zadd(expiryKey, extensionScore, speakerId);
        }
        this.logger.warn(`Extended TTL for speaker alias in note ${noteId}, will retry`);
        return { hasData: true, saved: false };
      } else {
        // 영구적 에러: Redis에서 삭제하고 실패 처리
        this.logger.warn(`Permanent error for speaker alias in note ${noteId}, removing from Redis`);
        await this.redisService.hdel(hashKey, expiringSpeakerIds);
        await this.redisService.zrem(expiryKey, expiringSpeakerIds);
        this.eventEmitter.emit(NOTE_EVENTS.ERROR, new NoteErrorEvent(noteId, ErrorCode.DB_UPDATE_FAILURE));

        const remainingCount = await this.redisService.zcard(expiryKey);
        if (remainingCount === 0) {
          await this.redisService.del(hashKey);
          await this.redisService.del(expiryKey);
        }
        return { hasData: remainingCount > 0, saved: false };
      }
    }
  }
}