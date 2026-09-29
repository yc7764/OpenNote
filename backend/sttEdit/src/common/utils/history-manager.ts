import { DataSource, EntityManager, Repository, ObjectLiteral } from 'typeorm';
import { Logger } from '@nestjs/common';

export interface HistoryManageConfig<THistory extends ObjectLiteral> {
  whereClause: Partial<THistory>;
  historyIdField: keyof THistory;
  orderByField: keyof THistory;
  maxRecords: number;
}

export interface HistoryOperations {
  createHistory: (manager: EntityManager) => Promise<void>;
  updateMainEntity: (manager: EntityManager) => Promise<void>;
}

/**
 * 히스토리 관리 유틸리티
 * PostgreSQL 트랜잭션 + FOR UPDATE 락을 사용하여 Race Condition 방지
 */
export class HistoryManager {
  private readonly logger = new Logger(HistoryManager.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * 히스토리 정리 + 삽입을 트랜잭션 내에서 FOR UPDATE 락과 함께 수행
   * @param historyRepo 히스토리 레포지토리
   * @param config 설정 (where 조건, ID 필드, 정렬 필드, 최대 개수)
   * @param operations 히스토리 생성 및 메인 엔티티 업데이트 함수
   */
  async manageHistoryWithLock<THistory extends ObjectLiteral>(
    historyRepo: Repository<THistory>,
    config: HistoryManageConfig<THistory>,
    operations: HistoryOperations,
  ): Promise<void> {
    const { whereClause, historyIdField, orderByField, maxRecords } = config;

    await this.dataSource.transaction(async (manager) => {
      // 1. FOR UPDATE 락으로 히스토리 조회
      const qb = manager
        .getRepository(historyRepo.target)
        .createQueryBuilder('h')
        .setLock('pessimistic_write');

      // where 조건 동적 생성
      const entries = Object.entries(whereClause);
      entries.forEach(([key, value], idx) => {
        if (idx === 0) {
          qb.where(`h.${key} = :${key}`, { [key]: value });
        } else {
          qb.andWhere(`h.${key} = :${key}`, { [key]: value });
        }
      });

      const histories = await qb
        .orderBy(`h.${String(orderByField)}`, 'ASC')
        .getMany();

      // 2. 개수 초과 시 가장 오래된 레코드 삭제
      if (histories.length >= maxRecords) {
        const oldestHistory = histories[0];
        const oldestId = oldestHistory[historyIdField];
        await manager.getRepository(historyRepo.target).delete(oldestId as any);
      }

      // 3. 새 히스토리 생성
      await operations.createHistory(manager);

      // 4. 메인 엔티티 업데이트
      await operations.updateMainEntity(manager);
    });
  }
}
