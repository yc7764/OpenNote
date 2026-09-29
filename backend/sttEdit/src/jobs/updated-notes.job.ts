/**
 * 어제 업데이트된 노트 세그먼트를 notes_note.content에 반영하는 배치 스크립트
 *
 * NOTE: 이 작업은 NestJS 내장 스케줄러(NoteContentSyncScheduler)에 의해
 *       매일 02:00 KST에 자동 실행됩니다.
 *       이 스크립트는 수동/긴급 실행용으로만 사용하세요.
 *
 * 실행 방법:
 *   npx ts-node src/jobs/updated-notes.job.ts
 *   또는 빌드 후: node dist/jobs/updated-notes.job.js
 *
 * 필요한 환경변수:
 *   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
 */
import 'reflect-metadata';
import {
  DataSource,
  Between,
  In,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// ===== Entity 정의 (독립 실행을 위해 직접 정의) =====

@Entity('notes_note')
class Note {
  @PrimaryGeneratedColumn('identity', { name: 'id' })
  id: number;

  @Column({ type: 'varchar', length: 20 })
  title: string;

  @Column({ type: 'jsonb' })
  content: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'interval' })
  duration: string;

  @Column({ type: 'boolean', name: 'is_recording' })
  isRecording: boolean;

  @Column({ type: 'varchar', length: 100, name: 'audio_file' })
  audioFile: string;

  @Column({ type: 'bigint', name: 'user_id' })
  userId: number;

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
  errorDetails: any | null;
}

@Entity('notes_note_segment')
class NoteSegment {
  @PrimaryGeneratedColumn('identity', { name: 'segment_id', generatedIdentity: 'BY DEFAULT' })
  segmentId: number;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'jsonb' })
  words: any;

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

  @Column({ type: 'bigint', name: 'stt_id' })
  sttId: number;

  @Column({ type: 'bigint', name: 'updated_by_id', nullable: true })
  updatedById: number;
}
// 로그 유틸
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

async function main() {
  log('INFO', '========================================');
  log('INFO', 'Updated Notes Batch Job Started');
  log('INFO', '========================================');

  // 환경변수 확인
  const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    log('ERROR', `Missing environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
  }

  // DataSource 설정
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [Note, NoteSegment],
    synchronize: false,
    logging: false,
  });

  try {
    // DB 연결
    log('INFO', 'Connecting to database...');
    await dataSource.initialize();
    log('INFO', 'Database connected successfully');

    const noteRepository = dataSource.getRepository(Note);
    const segmentRepository = dataSource.getRepository(NoteSegment);

    // 어제 날짜 계산
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
    const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));

    log('INFO', `Target date range: ${startOfYesterday.toISOString()} ~ ${endOfYesterday.toISOString()}`);

    // 어제 업데이트된 세그먼트 조회
    const updatedSegments = await segmentRepository.find({
      where: {
        updatedAt: Between(startOfYesterday, endOfYesterday),
      },
    });

    log('INFO', `Found ${updatedSegments.length} updated segments`);

    if (updatedSegments.length === 0) {
      log('INFO', 'No segments were updated yesterday. Job completed.');
      await dataSource.destroy();
      process.exit(0);
    }

    // stt_id 추출 (중복 제거)
    const sttIds = Array.from(new Set(updatedSegments.map((segment) => segment.sttId)));
    log('INFO', `Unique note IDs to process: ${sttIds.length}`, sttIds);

    // 해당 노트들 조회
    const notes = await noteRepository.find({
      where: { id: In(sttIds) },
    });

    log('INFO', `Found ${notes.length} notes to update`);

    // stt_id 기준으로 세그먼트 그룹화
    const segmentsBySttId = new Map<string, NoteSegment[]>();
    for (const segment of updatedSegments) {
      if (segment.sttId) {
        const key = String(segment.sttId);
        if (!segmentsBySttId.has(key)) {
          segmentsBySttId.set(key, []);
        }
        segmentsBySttId.get(key)!.push(segment);
      }
    }

    // 각 노트 업데이트
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const note of notes) {
      try {
        const updatedSegmentsForNote = segmentsBySttId.get(String(note.id)) || [];
        let newContent = note.content;

        log('INFO', `Processing note ID: ${note.id}, segments to merge: ${updatedSegmentsForNote.length}`);

        // content.segments가 있고, 업데이트할 세그먼트가 있는 경우에만 병합
        if (
          newContent?.segments &&
          Array.isArray(newContent.segments) &&
          updatedSegmentsForNote.length > 0
        ) {
          const updatedSegmentsMap = new Map(
            updatedSegmentsForNote.map((s) => [s.idx, s])
          );

          const mergedSegments = newContent.segments.map((originalSegment: any) => {
            const updatedSegment = updatedSegmentsMap.get(originalSegment.idx);
            if (updatedSegment) {
              return { ...originalSegment, text: updatedSegment.text, speaker: updatedSegment.speaker, };
            }
            return originalSegment;
          });

          newContent = { ...newContent, segments: mergedSegments };
        }

        // 중복 업데이트 방지: 이미 오늘 업데이트된 경우 스킵
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (note.updatedAt >= today) {
          log('WARN', `Note ID ${note.id} already updated today. Skipping.`);
          skipCount++;
          continue;
        }

        // DB 업데이트
        await noteRepository.update(note.id, {
          content: newContent,
          updatedAt: new Date(),
        });

        log('INFO', `Successfully updated note ID: ${note.id}`);
        successCount++;
      } catch (error: any) {
        log('ERROR', `Failed to update note ID: ${note.id}`, { error: error.message });
        errorCount++;
      }
    }

    // 결과 요약
    log('INFO', '========================================');
    log('INFO', 'Job Completed - Summary');
    log('INFO', '========================================');
    log('INFO', `Total segments found: ${updatedSegments.length}`);
    log('INFO', `Total notes processed: ${notes.length}`);
    log('INFO', `Success: ${successCount}`);
    log('INFO', `Skipped (already updated): ${skipCount}`);
    log('INFO', `Errors: ${errorCount}`);

    await dataSource.destroy();
    log('INFO', 'Database connection closed');

    if (errorCount > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (error: any) {
    log('ERROR', 'Job failed with error', { error: error.message, stack: error.stack });

    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }

    process.exit(1);
  }
}

main();
