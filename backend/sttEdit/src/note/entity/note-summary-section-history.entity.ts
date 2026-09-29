import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { NoteSummarySection } from './note-summary-section.entity';

@Entity('notes_summarysection_history')
export class NoteSummarySectionHistory {
  @PrimaryGeneratedColumn('identity', {
    name: 'sum_sec_hist_id',
    generatedIdentity: 'BY DEFAULT',
  })
  sumSecHistId: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', name: 'order' })
  order: number;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;

  @Column({ type: 'bigint', name: 'changed_by' })
  changedBy: number;

  @Column({ type: 'bigint', name: 'sum_sec_id' })
  sumSecId: number;

  @ManyToOne(() => NoteSummarySection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sum_sec_id' })
  summarySection: NoteSummarySection;
}