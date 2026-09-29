import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './entity/note.entity';
import { NoteSummary } from './entity/note-summary.entity';
import { NoteSummaryHistory } from './entity/note-summary-history.entity';
import { NoteSegment } from './entity/note-segment.entity';
import { NoteSegmentHistory } from './entity/note-segment-history.entity';
import { NoteSummarySection } from './entity/note-summary-section.entity';
import { NoteSummarySectionHistory } from './entity/note-summary-section-history.entity';
import { NoteService } from './note.service';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Note,
      NoteSummary,
      NoteSummaryHistory,
      NoteSegment,
      NoteSegmentHistory,
      NoteSummarySection,
      NoteSummarySectionHistory,
    ]),
    MonitoringModule,
  ],
  providers: [NoteService],
  exports: [NoteService], // 다른 모듈에서 사용할 수 있도록 export
})
export class NoteModule {}