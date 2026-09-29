import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { NoteSegment } from './note-segment.entity';

@Entity('notes_note_segment_history')
export class NoteSegmentHistory {
  @PrimaryGeneratedColumn('identity', {
    name: 'seg_hist_id', // DB 컬럼명: seg_hist_id
    generatedIdentity: 'BY DEFAULT',
  })
  segHistId: number; // 속성명 변경

  @Column({ type: 'text', nullable: false })
  text: string;

  @Column({ type: 'jsonb', nullable: false })
  words: any;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;

  // 원본 NoteSegment의 ID (FK)
  @Column({ type: 'bigint', name: 'segment_id', nullable: false })
  segmentId: number;

  @ManyToOne(() => NoteSegment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'segment_id' })
  segment: NoteSegment;

  // 변경한 사용자의 ID (FK)
  @Column({ type: 'bigint', name: 'changed_by', nullable: false })
  changedBy: number;
}