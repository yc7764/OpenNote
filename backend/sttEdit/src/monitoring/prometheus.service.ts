import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
  register,
} from 'prom-client';
import { normalizePath } from './utils/path-normalizer';

/**
 * Prometheus 메트릭 서비스
 *
 * Django의 django-prometheus 패턴과 유사하게 자동 메트릭 수집 및
 * 커스텀 메트릭을 정의합니다.
 *
 * 메트릭 명명 규칙:
 * - 접두사: sttedit_
 * - 단위: _total (카운터), _seconds (시간), _bytes (크기)
 */
@Injectable()
export class PrometheusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrometheusService.name);
  private registry: Registry;
  private stopDefaultMetrics: (() => void) | null | void = null;

  // ============================================================================
  // WebSocket 메트릭
  // ============================================================================

  /** 현재 활성 WebSocket 연결 수 */
  public websocketConnectionsActive: Gauge<string>;

  /** WebSocket 메시지 총 수 (type: update/status/setSpeaker, status: success/error) */
  public websocketMessagesTotal: Counter<string>;

  /** WebSocket 연결 총 수 (status: success/error) */
  public websocketConnectionsTotal: Counter<string>;

  // ============================================================================
  // Redis 메트릭
  // ============================================================================

  /** Redis 작업 총 수 (operation: get/set/hset/..., status: success/error) */
  public redisOperationsTotal: Counter<string>;

  /** Redis 작업 지연시간 (operation: get/set/hset/...) */
  public redisOperationDurationSeconds: Histogram<string>;

  // ============================================================================
  // 스케줄러 메트릭
  // ============================================================================

  /** 스케줄러 동기화 주기 시간 (type: note_data/speaker) */
  public schedulerSyncDurationSeconds: Histogram<string>;

  /** 스케줄러 동기화 총 수 (type: note_data/speaker, status: success/error) */
  public schedulerSyncsTotal: Counter<string>;

  // ============================================================================
  // 노트 메트릭
  // ============================================================================

  /** 노트 저장 총 수 (type: segment/summary/speaker, status: success/error) */
  public noteSavesTotal: Counter<string>;

  // ============================================================================
  // 보안 메트릭
  // ============================================================================

  /** Rate limit 거부 총 수 */
  public rateLimitRejectionsTotal: Counter<string>;

  /** 인증 실패 총 수 (reason: jwt_invalid/jwt_expired/unauthorized/...) */
  public authFailuresTotal: Counter<string>;

  /** 인증 성공 총 수 */
  public authSuccessTotal: Counter<string>;

  // ============================================================================
  // HTTP 메트릭
  // ============================================================================

  /** HTTP 요청 총 수 (method: GET/POST/..., path: /..., status: 2xx/4xx/5xx) */
  public httpRequestsTotal: Counter<string>;

  /** HTTP 요청 지연시간 (method: GET/POST/..., path: /...) */
  public httpRequestDurationSeconds: Histogram<string>;

  // ============================================================================
  // 모니터링 시스템 메트릭 (Monitoring System Metrics)
  // ============================================================================

  /** 경로 정규화 실패 총 수 */
  public pathNormalizationFailuresTotal: Counter<string>;

  /** 고유 경로 수 (카디널리티 모니터링용) */
  public uniquePathsGauge: Gauge<string>;

  /** /metrics 엔드포인트 접근 거부 총 수 (reason: ip_not_whitelisted/metrics_disabled) */
  public metricsAccessDeniedTotal: Counter<string>;

  onModuleInit() {
    this.logger.log('Initializing Prometheus metrics...');

    // 기본 레지스트리 사용 (글로벌)
    this.registry = register;

    // 기존 메트릭 클리어 (재시작 시 중복 방지)
    this.registry.clear();

    // Node.js 기본 메트릭 수집 (CPU, 메모리, 이벤트 루프 등)
    // collectDefaultMetrics returns a function to stop the collection
    this.stopDefaultMetrics = collectDefaultMetrics({
      register: this.registry,
      prefix: 'sttedit_nodejs_',
    });

    // 커스텀 메트릭 초기화
    this.initializeMetrics();

    this.logger.log('Prometheus metrics initialized successfully');
  }

  onModuleDestroy() {
    // Stop default metrics collection
    if (typeof this.stopDefaultMetrics === 'function') {
      this.stopDefaultMetrics();
      this.stopDefaultMetrics = null;
      this.logger.log('Default metrics collection stopped');
    }

    // Clear all metrics from registry
    this.registry.clear();
    this.logger.log('Prometheus metrics registry cleared');
  }

  private initializeMetrics(): void {
    // ========================================================================
    // WebSocket 메트릭
    // ========================================================================

    this.websocketConnectionsActive = new Gauge({
      name: 'sttedit_websocket_connections_active',
      help: 'Number of currently active WebSocket connections',
      registers: [this.registry],
    });

    this.websocketMessagesTotal = new Counter({
      name: 'sttedit_websocket_messages_total',
      help: 'Total number of WebSocket messages processed',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    });

    this.websocketConnectionsTotal = new Counter({
      name: 'sttedit_websocket_connections_total',
      help: 'Total number of WebSocket connection attempts',
      labelNames: ['status'],
      registers: [this.registry],
    });

    // ========================================================================
    // Redis 메트릭
    // ========================================================================

    this.redisOperationsTotal = new Counter({
      name: 'sttedit_redis_operations_total',
      help: 'Total number of Redis operations',
      labelNames: ['operation', 'status'],
      registers: [this.registry],
    });

    this.redisOperationDurationSeconds = new Histogram({
      name: 'sttedit_redis_operation_duration_seconds',
      help: 'Duration of Redis operations in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });

    // ========================================================================
    // 스케줄러 메트릭
    // ========================================================================

    this.schedulerSyncDurationSeconds = new Histogram({
      name: 'sttedit_scheduler_sync_duration_seconds',
      help: 'Duration of scheduler sync operations in seconds',
      labelNames: ['type'],
      buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.schedulerSyncsTotal = new Counter({
      name: 'sttedit_scheduler_syncs_total',
      help: 'Total number of scheduler sync operations',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    });

    // ========================================================================
    // 노트 메트릭
    // ========================================================================

    this.noteSavesTotal = new Counter({
      name: 'sttedit_note_saves_total',
      help: 'Total number of note save operations',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    });

    // ========================================================================
    // 보안 메트릭
    // ========================================================================

    this.rateLimitRejectionsTotal = new Counter({
      name: 'sttedit_rate_limit_rejections_total',
      help: 'Total number of rate limit rejections',
      registers: [this.registry],
    });

    this.authFailuresTotal = new Counter({
      name: 'sttedit_auth_failures_total',
      help: 'Total number of authentication failures',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.authSuccessTotal = new Counter({
      name: 'sttedit_auth_success_total',
      help: 'Total number of successful authentications',
      registers: [this.registry],
    });

    // ========================================================================
    // HTTP 메트릭
    // ========================================================================

    this.httpRequestsTotal = new Counter({
      name: 'sttedit_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'sttedit_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'path'],
      // 캐시 응답용 10ms 미만 버킷 추가, 타임아웃 구간 세분화
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 7.5, 10],
      registers: [this.registry],
    });

    // ========================================================================
    // 모니터링 시스템 메트릭
    // ========================================================================

    this.pathNormalizationFailuresTotal = new Counter({
      name: 'sttedit_path_normalization_failures_total',
      help: 'Total number of path normalization failures',
      registers: [this.registry],
    });

    this.uniquePathsGauge = new Gauge({
      name: 'sttedit_unique_paths_count',
      help: 'Number of unique HTTP paths being tracked (cardinality monitoring)',
      registers: [this.registry],
    });

    this.metricsAccessDeniedTotal = new Counter({
      name: 'sttedit_metrics_access_denied_total',
      help: 'Total number of /metrics endpoint access denials',
      labelNames: ['reason'],
      registers: [this.registry],
    });
  }

  /**
   * Prometheus 형식으로 모든 메트릭 반환
   */
  async getMetrics(): Promise<string> {
    try {
      return await this.registry.metrics();
    } catch (error) {
      this.logger.error('Failed to collect metrics', error);
      throw new InternalServerErrorException('Metrics collection failed');
    }
  }

  /**
   * 메트릭 컨텐츠 타입 반환
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  // ============================================================================
  // 편의 메서드 (Helper Methods)
  // ============================================================================

  /**
   * WebSocket 연결 수 증가
   */
  incrementWebSocketConnection(): void {
    this.websocketConnectionsActive.inc();
    this.websocketConnectionsTotal.inc({ status: 'success' });
  }

  /**
   * WebSocket 연결 수 감소
   */
  decrementWebSocketConnection(): void {
    this.websocketConnectionsActive.dec();
  }

  /**
   * WebSocket 연결 실패 기록
   */
  recordWebSocketConnectionFailure(): void {
    this.websocketConnectionsTotal.inc({ status: 'error' });
  }

  /**
   * WebSocket 메시지 기록
   */
  recordWebSocketMessage(type: 'update' | 'status' | 'setSpeaker', success: boolean): void {
    this.websocketMessagesTotal.inc({
      type,
      status: success ? 'success' : 'error',
    });
  }

  /**
   * Redis 작업 기록
   */
  recordRedisOperation(
    operation: string,
    success: boolean,
    durationSeconds: number,
  ): void {
    this.redisOperationsTotal.inc({
      operation,
      status: success ? 'success' : 'error',
    });
    this.redisOperationDurationSeconds.observe({ operation }, durationSeconds);
  }

  /**
   * 스케줄러 동기화 기록
   */
  recordSchedulerSync(
    type: 'note_data' | 'speaker',
    success: boolean,
    durationSeconds: number,
  ): void {
    this.schedulerSyncsTotal.inc({
      type,
      status: success ? 'success' : 'error',
    });
    this.schedulerSyncDurationSeconds.observe({ type }, durationSeconds);
  }

  /**
   * 노트 저장 기록
   * type은 NoteDataType과 일치: segment, summary_text, keywords, next_action, main_topic
   * 또는 speaker (별도 처리)
   */
  recordNoteSave(
    type: 'segment' | 'summary_text' | 'speaker' | 'keywords' | 'next_action' | 'main_topic',
    success: boolean,
  ): void {
    this.noteSavesTotal.inc({
      type,
      status: success ? 'success' : 'error',
    });
  }

  /**
   * Rate limit 거부 기록
   */
  recordRateLimitRejection(): void {
    this.rateLimitRejectionsTotal.inc();
  }

  /**
   * 인증 실패 기록
   */
  recordAuthFailure(reason: string): void {
    this.authFailuresTotal.inc({ reason });
  }

  /**
   * 인증 성공 기록
   */
  recordAuthSuccess(): void {
    this.authSuccessTotal.inc();
  }

  /**
   * HTTP 요청 기록
   */
  recordHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    // 상태 코드를 카테고리로 그룹화 (2xx, 3xx, 4xx, 5xx)
    const statusCategory = `${Math.floor(statusCode / 100)}xx`;

    this.httpRequestsTotal.inc({
      method,
      path: normalizePath(path),
      status: statusCategory,
    });

    this.httpRequestDurationSeconds.observe(
      {
        method,
        path: normalizePath(path),
      },
      durationSeconds,
    );
  }

  /**
   * 경로 정규화 (파라미터 값을 플레이스홀더로 변환)
   *
   * Cardinality explosion 방지:
   * - 쿼리 스트링 제거
   * - URL fragment 제거
   * - URL 인코딩 디코딩
   * - UUID, 숫자 ID를 :id로 변환
   */
}
