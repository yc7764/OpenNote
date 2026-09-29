import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('notes_note')
@Unique(['summaryId']) // notes_note_summary_id_key UNIQUE (summary_id)
export class Note {
  @PrimaryGeneratedColumn('identity', { name: 'id' })
  id: number;

  @Column({ type: 'varchar', length: 20 })
  title: string;

  @Column({ type: 'jsonb' })
  content: any; // 또는 더 구체적인 타입 (예: object)

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'interval' })
  duration: string; // PostgreSQL의 INTERVAL 타입은 TypeORM에서 string으로 매핑될 수 있습니다.

  @Column({ type: 'boolean', name: 'is_recording' })
  isRecording: boolean;

  @Column({ type: 'varchar', length: 100, name: 'audio_file' })
  audioFile: string;

  // CONSTRAINT notes_note_user_id_be6c80b4_fk_accounts_user_id
  @Column({ type: 'bigint', name: 'user_id' })
  userId: number;

  // CONSTRAINT notes_note_summary_id_9054de7b_fk_notes_summary_id
  @Column({ type: 'bigint', name: 'summary_id', nullable: true })
  summaryId: number | null;

  @Column({ type: 'text', nullable: true })
  preview: string | null;

  @Column({ type: 'varchar', length: 20, name: 'processing_status' })
  processingStatus: string;

  @Column({ type: 'timestamptz', name: 'processing_started_at', nullable: true })
  processingStartedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'processing_completed_at', nullable: true })
  processingCompletedAt: Date | null;

  @Column({ type: 'jsonb', name: 'error_details', nullable: true })
  errorDetails: any | null; // 또는 더 구체적인 타입 (예: object)

  @Column({ type: 'jsonb', default: {} })
  speakers: Record<string, { name: string }>;

  // Django가 관리하는 소프트 삭제 컬럼 — NULL이 아니면 휴지통 상태.
  // sttEdit은 읽기 전용으로 참조해 휴지통 노트의 소켓 접근·기록을 차단한다.
  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}