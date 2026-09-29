import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, IsNull, Repository } from 'typeorm';
import { Note } from './entity/note.entity';
import { NoteSummary } from './entity/note-summary.entity';
import { NoteSummaryHistory } from './entity/note-summary-history.entity';
import { NoteSegmentHistory } from './entity/note-segment-history.entity';
import { NoteSummarySection } from './entity/note-summary-section.entity';
import { NoteSummarySectionHistory } from './entity/note-summary-section-history.entity';
import { NoteSegment } from './entity/note-segment.entity';
import { Constants } from '../common/constants.enum';
import { contentSyncLogger } from '../config/winston.config';
import { HistoryManager } from '../common/utils/history-manager';
import { retryWithDelay } from '../common/utils/retry';
import { kstDayRange } from '../common/utils/kst-date.util';
import { SecurityLoggerService } from '../common/logger/security-logger.service';
import {
  NotePermissionException,
  NoteDeletedException,
  InvalidKeyFormatException,
  InvalidNoteIdException,
  MissingDataException,
} from '../common/exceptions/note.exceptions';
import { UpdateNoteDto } from '../websocket/dto/update-note.dto';
import { parseNoteId } from '../common/utils/note-id.util';

/**
 * 화자 기록 함수 공통 파라미터 검증.
 * noteId를 단일 헬퍼로 파싱하고 updatedBy(소유권 주체)를 필수화한다.
 * @returns { noteIdNum, ownerId } SQL WHERE 절에 그대로 바인딩할 정수 값
 */
function resolveSpeakerOwnership(
  noteId: string,
  updatedBy: string | undefined,
): { noteIdNum: number; ownerId: number } {
  const noteIdNum = parseNoteId(noteId);
  if (noteIdNum === null) {
    throw new InvalidNoteIdException(noteId);
  }
  if (updatedBy === undefined || updatedBy === null || updatedBy === '') {
    throw new MissingDataException('updatedBy', 'speaker mutation');
  }
  const ownerId = Number(updatedBy);
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    throw new MissingDataException('updatedBy', 'speaker mutation');
  }
  return { noteIdNum, ownerId };
}

// 타입 중복 선언 제거(MED-5): UpdateNoteDto를 single source로 사용
// (Redis에 저장된 JSON을 파싱해 캐스팅하는 용도 — 런타임 검증은 websocket 진입 시 이미 수행됨)
type UpdateNoteData = UpdateNoteDto;

@Injectable()
export class NoteService {
  private readonly logger = new Logger(NoteService.name);
  private readonly historyManager: HistoryManager;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
    @InjectRepository(NoteSummary)
    private readonly noteSummaryRepository: Repository<NoteSummary>,
    @InjectRepository(NoteSummaryHistory)
    private readonly noteSummaryHistoryRepository: Repository<NoteSummaryHistory>,
    @InjectRepository(NoteSegment)
    private readonly noteSegmentRepository: Repository<NoteSegment>,
    @InjectRepository(NoteSegmentHistory)
    private readonly noteSegmentHistoryRepository: Repository<NoteSegmentHistory>,
    @InjectRepository(NoteSummarySection)
    private readonly summarySectionRepository: Repository<NoteSummarySection>,
    @InjectRepository(NoteSummarySectionHistory)
    private readonly summarySectionHistoryRepository: Repository<NoteSummarySectionHistory>,
    private readonly securityLogger: SecurityLoggerService,
  ) {
    this.historyManager = new HistoryManager(dataSource);
  }

  // --- NoteSummary CRUD ---

  async findSummaryById(id: number): Promise<NoteSummary> {
    const summary = await this.noteSummaryRepository.findOne({ where: { id } });
    if (!summary) {
      throw new NotFoundException(`NoteSummary with id ${id} not found.`);
    }
    return summary;
  }

  async findSummaryAll(): Promise<NoteSummary[]> {
    return this.noteSummaryRepository.find();
  }

  async createSummary(createDto: Partial<NoteSummary>): Promise<NoteSummary> {
    const newSummary = this.noteSummaryRepository.create(createDto);
    return this.noteSummaryRepository.save(newSummary);
  }

  async updateSummary(id: number, updateDto: Partial<NoteSummary>): Promise<NoteSummary> {
    await this.noteSummaryRepository.update(id, updateDto);
    const updatedSummary = await this.findSummaryById(id);
    return updatedSummary;
  }

  async deleteSummary(id: number): Promise<{ deleted: boolean; id: number }> {
    const result = await this.noteSummaryRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`NoteSummary with id ${id} not found.`);
    }
    return { deleted: true, id };
  }

  /**
   * update Summary
   * @param key 
   * @param value 
   * @returns 
   */
  async updateSummaryFromRedis(key: string, value: string) {
    const data: UpdateNoteData = JSON.parse(value);
    const { noteId, type, payload, updatedBy, timestamp } = data;

    // 1. noteId로 note를 조회하여 summaryId를 획득합니다.
    const note = await this.noteRepository.findOne({ where: { id: Number(noteId) } });
    if (!note || !note.summaryId) {
      throw new NotFoundException(`Note or summaryId not found for noteId: ${noteId}.`);
    }

    // 소켓 연결 후 휴지통으로 이동한 노트의 잔여 편집은 플러시 시점에 폐기한다
    if (note.deletedAt) {
      throw new NoteDeletedException(noteId);
    }

    if(updatedBy !== String(note.userId)) {
      this.securityLogger.logUnauthorizedNoteAccess({
        userId: parseInt(updatedBy, 10) || undefined,
        noteId,
        action: 'updateSummary',
        reason: 'updatedBy does not match note owner',
      });
      throw new NotePermissionException(noteId, updatedBy || 'unknown', note.userId);
    }

    const summaryId = note.summaryId;
    // 2. 현재 summary 상태를 조회합니다.
    const currentSummary = await this.noteSummaryRepository.findOne({ where: { id: summaryId } });
    if (!currentSummary) {
      throw new NotFoundException(`NoteSummary with id ${summaryId} not found.`);
    }

    // 3. 키 타입에 따라 업데이트 payload 준비
    const updatePayload: Partial<NoteSummary> = {
      updatedAt: new Date(),
    };

    if (type === 'keywords') {
      updatePayload.keywords = payload;
    } else if (type === 'next_action') {
      updatePayload.nextActions = payload;
    } else if (type === 'main_topic') {
      updatePayload.mainTopic = payload;
    } else {
      return;
    }

    // 4. 트랜잭션 + FOR UPDATE 락으로 히스토리 관리 및 업데이트
    await this.historyManager.manageHistoryWithLock(
      this.noteSummaryHistoryRepository,
      {
        whereClause: { summaryId } as Partial<NoteSummaryHistory>,
        historyIdField: 'summaryHistId',
        orderByField: 'changedAt',
        maxRecords: Number(Constants.MAX_HISTORY_RECORDS),
      },
      {
        createHistory: async (manager) => {
          const history = manager.getRepository(NoteSummaryHistory).create({
            keywords: currentSummary.keywords,
            mainTopic: currentSummary.mainTopic,
            nextActions: currentSummary.nextActions,
            summaryId: currentSummary.id,
            changedAt: new Date(),
            changedBy: updatedBy ? parseInt(updatedBy, 10) : 0,
          });
          await manager.getRepository(NoteSummaryHistory).save(history);
        },
        updateMainEntity: async (manager) => {
          await manager.getRepository(NoteSummary).update(summaryId, updatePayload);
        },
      },
    );
  }

  /**
   * update Segment
   * @param key 
   * @param value 
   * @returns 
   */
  async updateSegmentFromRedis(key: string, value: string) {
    const keyParts = key.split(':');
    // Hash Tag 형식 {noteId}에서 중괄호 제거
    const noteId = Number(keyParts[1].replace(/[{}]/g, ''));
    const segmentId = Number(keyParts[3]);

    const data: UpdateNoteData = JSON.parse(value);
    const { payload, updatedBy } = data;

    // 1. stt_id와 segment_id로 note_segment 조회
    const currentSegment = await this.noteSegmentRepository.findOne({
      where: { sttId: noteId, segmentId: segmentId },
    });

    if (!currentSegment) {
      throw new NotFoundException(`Segment not found for sttId: ${noteId}, segmentId: ${segmentId}.`);
    }

    //note 작성자 조회
    const note = await this.noteRepository.findOne({ where: { id: Number(noteId) } });
    // 소켓 연결 후 휴지통으로 이동한 노트의 잔여 편집은 플러시 시점에 폐기한다
    if (note?.deletedAt) {
      throw new NoteDeletedException(noteId);
    }
    if(updatedBy !== String(note?.userId)) {
      this.securityLogger.logUnauthorizedNoteAccess({
        userId: parseInt(updatedBy, 10) || undefined,
        noteId: String(noteId),
        action: 'updateSegment',
        reason: 'updatedBy does not match note owner',
      });
      throw new NotePermissionException(noteId, updatedBy || 'unknown', note?.userId || 'unknown');
    }

    // 2. 업데이트 payload 준비
    const updatePayload: Partial<NoteSegment> = {
      text: payload,
      updatedAt: new Date(),
      updatedById: updatedBy ? parseInt(updatedBy, 10) : 0,
    };

    // 3. 트랜잭션 + FOR UPDATE 락으로 히스토리 관리 및 업데이트
    await this.historyManager.manageHistoryWithLock(
      this.noteSegmentHistoryRepository,
      {
        whereClause: { segmentId } as Partial<NoteSegmentHistory>,
        historyIdField: 'segHistId',
        orderByField: 'changedAt',
        maxRecords: Number(Constants.MAX_HISTORY_RECORDS),
      },
      {
        createHistory: async (manager) => {
          const history = manager.getRepository(NoteSegmentHistory).create({
            text: currentSegment.text,
            words: currentSegment.words,
            segmentId: currentSegment.segmentId,
            changedAt: new Date(),
            changedBy: updatedBy ? parseInt(updatedBy, 10) : 0,
          });
          await manager.getRepository(NoteSegmentHistory).save(history);
        },
        updateMainEntity: async (manager) => {
          await manager.getRepository(NoteSegment).update({ segmentId, sttId: noteId }, updatePayload);
        },
      },
    );
  }

  /**
   * update Summary section
   * @param key 
   * @param value 
   * @returns 
   */
  async updateSummaryTextFromRedis(key: string, value: string): Promise<void> {

    const parts = key.split(':');
    if (parts.length < 3 || parts[0] !== 'note' || parts[2] !== 'summary_text') {
      throw new InvalidKeyFormatException(key, 'note:{noteId}:summary_text:{sectionId}');
    }
    // Hash Tag 형식 {noteId}에서 중괄호 제거
    const noteId = parts[1].replace(/[{}]/g, '');

    // 1. Redis 데이터 파싱
    const redisData = JSON.parse(value);
    const { sectionId, payload, updatedBy } = redisData;

    if (!sectionId || !payload) {
      throw new MissingDataException('sectionId or payload', `Redis value for key ${key}`);
    }

    const { title, content } = payload;

    // 2. noteId로 note를 조회하여 summaryId 획득
    const note = await this.noteRepository.findOne({
      where: { id: Number(noteId) },
    });

    if (!note || !note.summaryId) {
      throw new NotFoundException(`Note with ID ${noteId} or its summaryId not found.`);
    }

    // 소켓 연결 후 휴지통으로 이동한 노트의 잔여 편집은 플러시 시점에 폐기한다
    if (note.deletedAt) {
      throw new NoteDeletedException(noteId);
    }

    if(updatedBy !== String(note?.userId)) {
      this.securityLogger.logUnauthorizedNoteAccess({
        userId: parseInt(updatedBy, 10) || undefined,
        noteId,
        action: 'updateSummaryText',
        reason: 'updatedBy does not match note owner',
      });
      throw new NotePermissionException(noteId, updatedBy || 'unknown', note?.userId || 'unknown');
    }

    const summaryId = note.summaryId;

    // 3. summaryId와 sectionId로 note_summarysection 테이블 검색
    const summarySection = await this.summarySectionRepository.findOne({
      where: {
        order: sectionId,
        summaryId: summaryId,
      },
    });

    if (!summarySection) {
      throw new NotFoundException(`SummarySection with ID ${sectionId} not found for summary order ${summaryId}.`);
    }

    // 4. 업데이트 payload 준비
    const updatePayload: Partial<NoteSummarySection> = {
      title: title,
      content: content,
    };

    // 5. 트랜잭션 + FOR UPDATE 락으로 히스토리 관리 및 업데이트
    await this.historyManager.manageHistoryWithLock(
      this.summarySectionHistoryRepository,
      {
        whereClause: { sumSecId: summarySection.id, order: sectionId } as Partial<NoteSummarySectionHistory>,
        historyIdField: 'sumSecHistId',
        orderByField: 'changedAt',
        maxRecords: Number(Constants.MAX_HISTORY_RECORDS),
      },
      {
        createHistory: async (manager) => {
          const historyEntry = manager.getRepository(NoteSummarySectionHistory).create({
            sumSecId: summarySection.id,
            title: summarySection.title,
            content: summarySection.content,
            order: summarySection.order,
            changedAt: new Date(),
            changedBy: updatedBy ? parseInt(updatedBy, 10) : 0,
          });
          await manager.getRepository(NoteSummarySectionHistory).save(historyEntry);
        },
        updateMainEntity: async (manager) => {
          await manager.getRepository(NoteSummarySection).update(summarySection.id, updatePayload);
        },
      },
    );
  }

  /**
   * segment별 speaker를 일괄 업데이트
   * CASE WHEN으로 여러 segment를 한 번의 쿼리로 업데이트
   * @param noteId 노트 ID (stt_id)
   * @param segmentSpeakers segment별 speaker 매핑 { segmentId: speakerId }
   * @param updatedBy 수정자 ID
   */
  async updateSegmentSpeakers(
    noteId: string,
    segmentSpeakers: Record<string, string>,
    updatedBy?: string,
  ): Promise<void> {
    const entries = Object.entries(segmentSpeakers);
    if (entries.length === 0) return;

    // noteId 단일 파싱 + updatedBy(소유권 주체) 필수화
    const { noteIdNum, ownerId } = resolveSpeakerOwnership(noteId, updatedBy);

    // 동적 파라미터 바인딩으로 CASE WHEN 구문 생성
    // $1: updatedBy/owner, $2: noteId, $3: segmentIds, $4~: speakerId 값들
    const segmentIds = entries.map(([segId]) => Number(segId));
    const speakerValues = entries.map(([, spkId]) => spkId);

    // CASE WHEN segment_id THEN $4 WHEN segment_id THEN $5 ... 형태로 생성
    const cases = entries
      .map(([segId], index) => `WHEN ${Number(segId)} THEN $${index + 4}`)
      .join(' ');

    // notes_note_segment에는 user_id가 없으므로 stt_id→notes_note 소유권을
    // EXISTS 서브쿼리로 SQL 레벨에서 강제한다(비소유 노트면 0행 갱신).
    const result = await this.dataSource.query(
      `UPDATE notes_note_segment
       SET speaker = CASE segment_id ${cases} END,
           updated_at = NOW(),
           updated_by_id = $1
       WHERE stt_id = $2 AND segment_id = ANY($3)
         AND EXISTS (SELECT 1 FROM notes_note n WHERE n.id = $2 AND n.user_id = $1 AND n.deleted_at IS NULL)`,
      [ownerId, noteIdNum, segmentIds, ...speakerValues],
    );

    this.logger.log(
      `Updated ${result[1] ?? 0} segment speakers for note ${noteId}: ${JSON.stringify(segmentSpeakers)}`,
    );
  }

  /**
   * 임시 화자를 notes_note.speakers에 원자적으로 추가 (정식 승격)
   * PostgreSQL || 연산자로 JSONB merge (race condition 방지)
   * @param noteId 노트 ID
   * @param newSpeakers 추가할 화자 목록 (speakerId → name)
   */
  async addSpeakersToNote(
    noteId: string,
    newSpeakers: Record<string, string>,
    updatedBy?: string,
  ): Promise<void> {
    // noteId 단일 파싱 + updatedBy(소유권 주체) 필수화
    const { noteIdNum, ownerId } = resolveSpeakerOwnership(noteId, updatedBy);

    // Record<string, string>을 {"sp_3": {"name": "홍길동"}} 형태로 변환
    const speakersJsonb: Record<string, { name: string }> = {};
    for (const [speakerId, name] of Object.entries(newSpeakers)) {
      speakersJsonb[speakerId] = { name };
    }

    // WHERE에 user_id를 함께 강제해 타인 노트로의 화자 기록을 SQL 레벨에서 차단.
    const result = await this.dataSource.query(
      `UPDATE notes_note SET speakers = speakers || $1::jsonb, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [JSON.stringify(speakersJsonb), noteIdNum, ownerId],
    );

    if (result[1] === 0) {
      throw new NotFoundException(`Note with id ${noteId} not found or not owned by user ${ownerId} for speaker update.`);
    }
  }

  /**
   * 화자 병합: sourceId의 모든 발화를 targetId로 변경하고, speakers JSON에서 sourceId 제거
   * 1. notes_note_segment.speaker 업데이트 (sourceId → targetId)
   * 2. notes_note.speakers에서 sourceId 제거 (PostgreSQL JSONB - 연산자)
   *
   * 연쇄 병합 처리: sp_5→sp_4, sp_4→sp_3 동시 처리 시 sp_5→sp_3으로 최종 target 계산
   * Object.entries 순서가 보장되지 않으므로, 처리 전 연쇄 병합을 미리 해결
   *
   * @param noteId 노트 ID
   * @param mergeMap 병합 매핑 { sourceId: targetId }
   */
  async mergeSpeakers(
    noteId: string,
    mergeMap: Record<string, string>,
    updatedBy?: string,
  ): Promise<void> {
    const entries = Object.entries(mergeMap);
    if (entries.length === 0) return;

    // noteId 단일 파싱 + updatedBy(소유권 주체) 필수화
    const { noteIdNum, ownerId } = resolveSpeakerOwnership(noteId, updatedBy);

    // 연쇄 병합 해결: 각 sourceId의 최종 targetId 계산
    // 예: { sp_5: sp_4, sp_4: sp_3 } → { sp_5: sp_3, sp_4: sp_3 }
    const resolvedMergeMap = this.resolveChainedMerges(mergeMap);
    const resolvedEntries = Object.entries(resolvedMergeMap);
    if (resolvedEntries.length === 0) return;

    const sourceIds = resolvedEntries.map(([s]) => s);

    // 트랜잭션으로 segment 업데이트와 speakers JSON 업데이트를 원자적으로 처리
    await this.dataSource.transaction(async (manager) => {
      // 1. notes_note_segment.speaker 일괄 업데이트 (CASE WHEN)
      // EXISTS 서브쿼리로 stt_id→notes_note 소유권을 SQL 레벨에서 강제.
      const caseFragments = resolvedEntries.map(
        (_, i) => `WHEN $${i * 2 + 3} THEN $${i * 2 + 4}`,
      );
      const ownerParamIndex = resolvedEntries.length * 2 + 3;
      await manager.query(
        `UPDATE notes_note_segment
         SET speaker = CASE speaker ${caseFragments.join(' ')} ELSE speaker END,
             updated_at = NOW()
         WHERE stt_id = $1 AND speaker = ANY($2::text[])
           AND EXISTS (SELECT 1 FROM notes_note n WHERE n.id = $1 AND n.user_id = $${ownerParamIndex} AND n.deleted_at IS NULL)`,
        [noteIdNum, sourceIds, ...resolvedEntries.flat(), ownerId],
      );

      // 2. notes_note.speakers에서 sourceId 일괄 제거 (JSONB - text[])
      // user_id를 함께 강제해 비소유 노트 변조 차단.
      await manager.query(
        `UPDATE notes_note
         SET speakers = speakers - $1::text[], updated_at = NOW()
         WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`,
        [sourceIds, noteIdNum, ownerId],
      );
    });

    this.logger.log(
      `Merged speakers for note ${noteId}: original=${JSON.stringify(mergeMap)}, resolved=${JSON.stringify(resolvedMergeMap)}`,
    );
  }

  /**
   * 연쇄 병합 해결: 각 sourceId의 최종 targetId를 계산
   * 예: { sp_5: sp_4, sp_4: sp_3 } → { sp_5: sp_3, sp_4: sp_3 }
   * 순환 참조 방지: visited set으로 감지
   */
  private resolveChainedMerges(
    mergeMap: Record<string, string>,
  ): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const [sourceId, targetId] of Object.entries(mergeMap)) {
      let finalTarget = targetId;
      const visited = new Set<string>([sourceId]);

      // targetId가 다른 병합의 sourceId인 경우 최종 target까지 추적
      while (mergeMap[finalTarget]) {
        // 순환 참조 감지
        if (visited.has(finalTarget)) {
          this.logger.warn(
            `Circular merge detected: ${sourceId} → ... → ${finalTarget}. Breaking chain.`,
          );
          break;
        }
        visited.add(finalTarget);
        finalTarget = mergeMap[finalTarget];
      }

      resolved[sourceId] = finalTarget;
    }

    return resolved;
  }

  /**
   * 화자명 변경: notes_note.speakers에서 해당 speakerId의 name을 업데이트
   * PostgreSQL jsonb_set을 사용하여 원자적으로 업데이트
   * TOCTOU 방지: speakers ? speakerId 조건으로 존재하는 화자만 업데이트
   *
   * @param noteId 노트 ID
   * @param aliasMap 화자명 변경 매핑 { speakerId: newName }
   * @returns 실제로 업데이트된 speakerId 목록
   */
  async updateSpeakerAlias(
    noteId: string,
    aliasMap: Record<string, string>,
    updatedBy?: string,
  ): Promise<string[]> {
    const entries = Object.entries(aliasMap);
    if (entries.length === 0) return [];

    // noteId 단일 파싱 + updatedBy(소유권 주체) 필수화
    const { noteIdNum, ownerId } = resolveSpeakerOwnership(noteId, updatedBy);

    const updatedSpeakerIds: string[] = [];

    // 트랜잭션으로 여러 화자명을 원자적으로 업데이트
    await this.dataSource.transaction(async (manager) => {
      for (const [speakerId, newName] of entries) {
        // jsonb_set(speakers, '{speakerId,name}', '"newName"')
        // speakers ? speakerId 조건으로 존재하는 화자만 업데이트 (TOCTOU 방지)
        // user_id를 함께 강제해 비소유 노트 변조 차단.
        const result = await manager.query(
          `UPDATE notes_note
           SET speakers = jsonb_set(speakers, $1, $2::jsonb),
               updated_at = NOW()
           WHERE id = $3 AND user_id = $5 AND speakers ? $4 AND deleted_at IS NULL`,
          [`{${speakerId},name}`, JSON.stringify(newName), noteIdNum, speakerId, ownerId],
        );

        // result[1]은 affected rows
        if (result[1] > 0) {
          updatedSpeakerIds.push(speakerId);
        }
      }
    });

    this.logger.log(
      `Updated speaker aliases for note ${noteId}: requestedIds=${JSON.stringify(Object.keys(aliasMap))}, updated=${JSON.stringify(updatedSpeakerIds)}`,
    );

    return updatedSpeakerIds;
  }

  // --- NoteSegment CRUD ---

  async findSegmentById(id: number): Promise<NoteSegment> {
    const segment = await this.noteSegmentRepository.findOne({ where: { segmentId: id } });
    if (!segment) {
      throw new NotFoundException(`NoteSegment with id ${id} not found.`);
    }
    return segment;
  }

  async findSegmentsByNoteId(noteId: number): Promise<NoteSegment[]> {
    return this.noteSegmentRepository.find({ where: { sttId: noteId } });
  }

  async createSegment(createDto: Partial<NoteSegment>): Promise<NoteSegment> {
    const newSegment = this.noteSegmentRepository.create(createDto);
    return this.noteSegmentRepository.save(newSegment);
  }

  async updateSegment(id: number, updateDto: Partial<NoteSegment>): Promise<NoteSegment> {
    await this.noteSegmentRepository.update(id, updateDto);
    const updatedSegment = await this.findSegmentById(id);
    return updatedSegment;
  }

  async deleteSegment(id: number): Promise<{ deleted: boolean; id: number }> {
    const result = await this.noteSegmentRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`NoteSegment with id ${id} not found.`);
    }
    return { deleted: true, id };
  }

  async findUpdatedToday(): Promise<{ result: boolean; message?: string; timestamp: Date }> {

    // 1. 어제 날짜의 시작과 끝을 계산합니다.
    // 크론은 KST 02:00에 돌지만 컨테이너 프로세스는 UTC라, 로컬 setHours 경계를 쓰면
    // 조회 구간이 KST 달력과 15시간 어긋나 낮 시간대 편집이 영영 누락된다. KST 경계로 고정.
    const { start: startOfYesterday, end: endOfYesterday } = kstDayRange(1);

    // 2. notes_note_segment에서 updated_at이 어제인 데이터를 모두 가져옵니다.
    const updatedSegments = await this.noteSegmentRepository.find({
      where: {
        updatedAt: Between(startOfYesterday, endOfYesterday),
      },
    });

    if (updatedSegments.length === 0) {
      return { result: true, message: 'No segments were updated yesterday.', timestamp: new Date() };
    }

    // 3. 획득한 stt_id를 중복 없이 추출합니다.
    const sttIds = [...new Set(updatedSegments.map((segment) => segment.sttId))];

    // 4. stt_id를 사용하여 notes_note 테이블의 데이터를 조회합니다.
    // 휴지통(소프트 삭제) 노트는 동결 상태여야 하므로 content 병합 대상에서 제외한다.
    const notes = await this.noteRepository.find({
      where: { id: In(sttIds), deletedAt: IsNull() },
    });

    // 5. stt_id를 기준으로 세그먼트들을 그룹화합니다.
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

    // 6. 각 note 객체의 content를 업데이트하고 DB에 저장합니다.
    try {
      // 중복 방지 기준도 동일하게 KST 자정 — 프로세스 TZ(UTC) 자정을 쓰면 기준이 어긋난다
      const todayStart = kstDayRange(0).start;

      const updatePromises = notes.map(async (note) => {
        // 서버 이중화로 인한 중복 업데이트 방지 로직
        // 오늘 이미 배치에서 업데이트된 노트는 중복 처리 방지를 위해 건너뛴다.
        if (note.updatedAt >= todayStart) {
          return { noteId: note.id, skipped: true };
        }

        const updatedSegmentsForNote = segmentsBySttId.get(String(note.id)) || [];
        let newContent = note.content;

        // note.content와 업데이트된 세그먼트가 모두 존재할 경우에만 덮어쓰기 로직 실행
        if (newContent?.segments && Array.isArray(newContent.segments) && updatedSegmentsForNote.length > 0) {
          // 빠른 조회를 위해 업데이트된 세그먼트를 Map으로 변환 (key: idx)
          const updatedSegmentsMap = new Map(updatedSegmentsForNote.map((s) => [s.idx, s]));

          // 기존 content.segments를 순회하며 업데이트된 내용으로 교체
          const mergedSegments = newContent.segments.map((originalSegment: any) => {
            const updatedSegment = updatedSegmentsMap.get(originalSegment.idx);
            if (updatedSegment) {
              // 일치하는 세그먼트가 있으면 text와 speaker를 덮어쓴다.
              return { ...originalSegment, text: updatedSegment.text, speaker: updatedSegment.speaker };
            }
            return originalSegment;
          });

          newContent = { ...newContent, segments: mergedSegments };
        }

        // DB 업데이트 실행 (실패 시 exponential backoff 재시도)
        await retryWithDelay(
          () => this.noteRepository.update(note.id, {
            content: newContent,
            updatedAt: new Date(),
          }),
          Number(Constants.BATCH_RETRY_COUNT),
          Number(Constants.BATCH_RETRY_BASE_DELAY_MS),
        );

        return { noteId: note.id, skipped: false };
      });

      const results = await Promise.allSettled(updatePromises);
      const failed = results.filter((r) => r.status === 'rejected');
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && !r.value?.skipped,
      );

      if (failed.length > 0) {
        failed.forEach((f) => {
          contentSyncLogger.error({
            message: 'Failed to update note in findUpdatedToday after retries',
            stack: (f as PromiseRejectedResult).reason?.stack,
            context: 'NoteService',
          });
        });
      }

      return {
        result: failed.length === 0,
        message: `Updated ${succeeded.length}/${notes.length} notes.${failed.length > 0 ? ` ${failed.length} failed after ${Constants.BATCH_RETRY_COUNT} retries.` : ''}`,
        timestamp: new Date(),
      };
    } catch (error) {
      contentSyncLogger.error({
        message: 'Failed to update notes in findUpdatedToday',
        stack: error.stack,
        context: 'NoteService',
      });
      return { result: false, message: `Failed to update notes in findUpdatedToday`, timestamp: new Date() };
    }
  }
}