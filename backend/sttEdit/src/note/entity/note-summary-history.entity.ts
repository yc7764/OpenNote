import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { NoteSummary } from './note-summary.entity';

@Entity('notes_note_summary_history')
export class NoteSummaryHistory {
  @PrimaryGeneratedColumn('identity', {
    name: 'summary_hist_id',
    generatedIdentity: 'BY DEFAULT', // SQL과 일치
  })
  summaryHistId: number;

  @Column({ type: 'varchar', array: true })
  keywords: string[];

  @Column({ type: 'text', nullable: true, name: 'main_topic' })
  mainTopic: string;

  @Column({ type: 'text', nullable: true, name: 'next_actions' }) // next_action -> next_actions
  nextActions: string;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;

  @Column({ type: 'bigint', name: 'changed_by', nullable: true })
  changedBy: number | null;

  @Column({ type: 'bigint', name: 'summary_id' })
  summaryId: number;

  @ManyToOne(() => NoteSummary, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'summary_id' })
  summary: NoteSummary;
}