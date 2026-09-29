import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notes_note_segment')
export class NoteSegment {
  @PrimaryGeneratedColumn('identity', {
    name: 'segment_id',
    generatedIdentity: 'BY DEFAULT',
  })
  segmentId: number;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'jsonb' })
  words: any; // 또는 더 구체적인 타입

  @Column({ type: 'float8' })
  start: number;

  @Column({ type: 'float8' })
  end: number;

  @Column({ type: 'int' })
  idx: number;

  @Column({ type: 'varchar', length: 255 })
  speaker: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date;

  // CONSTRAINT notes_note_segment_stt_id_a9b381ef_fk_notes_note_id
  @Column({ type: 'bigint', name: 'stt_id' })
  sttId: number;

  // CONSTRAINT notes_note_segment_updated_by_id_195cf10b_fk_accounts_user_id
  @Column({ type: 'bigint', name: 'updated_by_id', nullable: true })
  updatedById: number;
}