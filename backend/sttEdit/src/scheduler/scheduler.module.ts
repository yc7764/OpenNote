import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '../redis/redis.module';
import { NoteModule } from '../note/note.module';
import { NoteSchedulerService } from './note-scheduler.service';
import { NoteContentSyncScheduler } from './note-content-sync.scheduler';

@Module({
  imports: [ScheduleModule.forRoot(), RedisModule, NoteModule],
  providers: [NoteSchedulerService, NoteContentSyncScheduler],
})
export class SchedulerModule {}