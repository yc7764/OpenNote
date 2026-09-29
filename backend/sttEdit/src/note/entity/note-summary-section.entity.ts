import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { NoteSummary } from './note-summary.entity';
import { NoteSummarySectionHistory } from './note-summary-section-history.entity';

@Entity('notes_summarysection')
export class NoteSummarySection {
  @PrimaryGeneratedColumn('identity', {
    name: 'id',
    generatedIdentity: 'BY DEFAULT',
  })
  id: number; // int8 (bigint)은 number 또는 string으로 매핑됩니다.

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', name: 'order' })
  order: number;

  @Column({ type: 'interval', name: 'start_time' })
  startTime: any; // PostgreSQL interval 타입은 string ('00:01:30') 또는 객체로 매핑될 수 있습니다.

  @Column({ type: 'interval', name: 'end_time' })
  endTime: any; // PostgreSQL interval 타입은 string ('00:02:00') 또는 객체로 매핑될 수 있습니다.

  @Column({ type: 'bigint', name: 'summary_id' })
  summaryId: number;

  @ManyToOne(() => NoteSummary, {
    onDelete: 'CASCADE', // summary가 삭제될 때 section도 함께 삭제되도록 설정할 수 있습니다.
  })
  @JoinColumn({ name: 'summary_id' })
  summary: NoteSummary;

  @OneToMany(
    () => NoteSummarySectionHistory,
    (history) => history.summarySection,
  )
  histories: NoteSummarySectionHistory[];
}