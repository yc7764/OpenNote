import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notes_summary')
export class NoteSummary {
  @PrimaryGeneratedColumn('identity', {
    name: 'id',
    generatedIdentity: 'BY DEFAULT',
  })
  id: number; // bigint will be mapped to number or string depending on configuration

  @Column({ type: 'varchar', array: true })
  keywords: string[];

  @Column({ type: 'text', nullable: true, name: 'main_topic' })
  mainTopic: string;

  @Column({ type: 'text', nullable: true, name: 'next_actions' })
  nextActions: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}