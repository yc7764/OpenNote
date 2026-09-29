import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { NoteService } from '../note/note.service';
import { randomUUID } from 'crypto';
import { Constants } from '../common/constants.enum';
import { contentSyncLogger } from '../config/winston.config';

@Injectable()
export class NoteContentSyncScheduler {
  private readonly logger = contentSyncLogger;
  private readonly context = NoteContentSyncScheduler.name;
  private readonly serverId = randomUUID();

  constructor(
    private readonly redisService: RedisService,
    private readonly noteService: NoteService,
  ) {}

  /**
   * 매일 02:00 KST에 실행
   * 어제 업데이트된 NoteSegment의 text를 부모 Note의 content.segments에 병합
   *
   * Cron: second minute hour dayOfMonth month dayOfWeek
   */
  @Cron('0 0 2 * * *', {
    name: 'note-content-sync',
    timeZone: 'Asia/Seoul',
  })
  async handleDailyContentSync(): Promise<void> {
    this.logger.info({ message: 'Note content sync job triggered', context: this.context });

    const lockAcquired = await this.redisService.acquireLock(
      Constants.CONTENT_SYNC_LOCK_KEY,
      this.serverId,
      Constants.CONTENT_SYNC_LOCK_TTL,
    );

    if (!lockAcquired) {
      this.logger.info({ message: 'Another instance is already running the content sync job. Skipping.', context: this.context });
      return;
    }

    try {
      this.logger.info({ message: 'Lock acquired. Starting daily content sync...', context: this.context });
      const startTime = Date.now();

      const result = await this.noteService.findUpdatedToday();

      const elapsed = Date.now() - startTime;
      this.logger.info({
        message: `Content sync completed in ${elapsed}ms - result: ${result.result}, message: ${result.message}`,
        context: this.context,
      });
    } catch (error) {
      this.logger.error({
        message: `Content sync job failed: ${error.message}`,
        stack: error.stack,
        context: this.context,
      });
    } finally {
      await this.redisService.releaseLock(
        Constants.CONTENT_SYNC_LOCK_KEY,
        this.serverId,
      );
      this.logger.info({ message: 'Lock released', context: this.context });
    }
  }
}
