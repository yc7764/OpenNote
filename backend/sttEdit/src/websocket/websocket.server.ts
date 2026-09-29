import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '../redis/redis.service';
import { ErrorCode, getErrorMessage } from '../common/error-code.enum';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Constants, DisconnectReason } from '../common/constants.enum';
import { WebsocketConnectionService } from './websocket.connection.service';
import {
  verifyJwtToken,
  validateTokenExpiry,
  validateTokenUser,
} from './websocket.validator';
import { validateUpdateNoteData, validateSetSpeakerData, XssDetection } from './websocket.data-validator';
import { UpdateNoteDto } from './dto/update-note.dto';
import { checkRateLimit } from './websocket.rate-limiter';
import { JwtService } from '@nestjs/jwt';
import { NOTE_EVENTS, NoteSavedEvent, NoteErrorEvent } from '../events/note.events';
import { PrometheusService } from '../monitoring/prometheus.service';
import { SecurityLoggerService } from '../common/logger/security-logger.service';

// 타입 중복 선언 제거(MED-5): UpdateNoteDto를 single source로 사용
type UpdateNoteData = UpdateNoteDto;

interface WorkingStatus {
  noteId: string;
  segmentId?: string;
  sectionId?: string;
  speakerId?: string;  // speaker_alias 타입에서 사용
  type: 'segment' | 'summary_text' | 'keywords' | 'next_action' | 'main_topic' | 'speaker_alias';
  status: 'start' | 'stop' | 'save';
  userId: string;
}

type NoteDataType = 'segment' | 'summary_text' | 'keywords' | 'next_action' | 'main_topic' | 'speaker_alias';

// status 이벤트 검증용 화이트리스트 — 검증된 값만 재조립해 브로드캐스트한다.
// update/setSpeaker와 달리 status는 그동안 원시 data를 {...data}로 룸+pub/sub에
// 뿌려 (1) 대용량 페이로드 pub/sub 증폭, (2) 노트 공유 시 cross-user XSS 위험이 있었다.
const ALLOWED_STATUS_TYPES: ReadonlySet<string> = new Set([
  'segment', 'summary_text', 'keywords', 'next_action', 'main_topic', 'speaker_alias',
]);
const ALLOWED_STATUS_VALUES: ReadonlySet<string> = new Set(['start', 'stop', 'save']);
// segmentId/sectionId는 숫자, speakerId는 sp_N 형식이라 짧다. 정규식만으로는
// 초장문 숫자열이 통과할 수 있어 길이 상한을 함께 둔다(pub/sub 증폭 차단).
const STATUS_ID_MAX_LENGTH = 50;

@Injectable()
// CORS는 CorsIoAdapter가 부트스트랩에서 ConfigService로 설정한다.
// 데코레이터 평가 시점에 process.env를 읽어 .env-only 환경에서 localhost로 폴백되던 문제를 피한다.
@WebSocketGateway({
  namespace: '/note',
})
export class websocketServer
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly instanceId = randomUUID();
  private readonly logger = new Logger(websocketServer.name);

  // status 메시지 lock-flood 방지용 per-socket 토큰 버킷 (in-memory)
  // handleDisconnect에서 client.id 키를 정리하여 메모리 누수 방지
  private readonly statusRateBuckets = new Map<string, { tokens: number; last: number }>();

  // R5: per-user status 토큰 버킷 (소켓 무관, in-memory). 다중 소켓으로 per-socket
  // 상한을 우회하는 것을 막는다. 사용자별 1엔트리라 자연 유계이나, 상한 초과 시
  // 가장 오래 미사용된 엔트리부터 제거한다(tryConsumeUserStatusToken 참조).
  private readonly statusRateBucketsByUser = new Map<string, { tokens: number; last: number }>();

  // Pubsub 채널 매핑
  private readonly CHANNEL_MAP: Record<NoteDataType, string> = {
    segment: 'segments',
    summary_text: 'summary_text',
    keywords: 'keywords',
    next_action: 'next_action',
    main_topic: 'main_topic',
    speaker_alias: 'speaker_alias',
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly connectionService: WebsocketConnectionService,
    private readonly prometheusService: PrometheusService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  async afterInit() {
    await this.redisService.subscribe(
      Constants.DISCONNECT_SOCKET_CHANNEL,
      (message: string) => {
        try {
          this.handleDisconnectRequest(message);
        } catch (error) {
          this.logger.error(`Error handling disconnect request: ${error.message}`);
        }
      },
    );
    this.logger.log(
      `WebSocket Server initialized with instance ID: ${this.instanceId}`,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Connection Lifecycle
  // ─────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    // H3: 핫패스의 Redis 일시 오류(commandTimeout·페일오버)로 생긴 미처리 예외가
    // winston(exitOnError:true)을 통해 process.exit로 확대돼 인스턴스의 모든 세션이
    // 끊기던 것을 막는다. 본문을 감싸 로깅 후 이 연결만 정리한다.
    try {
      await this.handleConnectionCore(client);
    } catch (error) {
      this.logger.error(
        `handleConnection failed for ${client.id}: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      this.prometheusService.recordWebSocketConnectionFailure();
      try {
        client.disconnect(true);
      } catch {
        /* 소켓 정리 실패는 무시 */
      }
    }
  }

  private async handleConnectionCore(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    const clientIp = this.getClientIp(client);

    // 1. 인증 정보 추출
    const { authToken, noteId } = this.connectionService.extractAuthInfo(client);

    // 2. 필수 파라미터 검증
    const paramValidation = this.connectionService.validateRequiredParams(authToken, noteId);
    if (!paramValidation.valid) {
      this.logger.warn(`Missing ${paramValidation.errorCode} from client ${client.id}`);
      this.prometheusService.recordWebSocketConnectionFailure();
      this.prometheusService.recordAuthFailure('missing_params');
      this.securityLogger.logConnectionFailure({
        ip: clientIp,
        noteId: noteId ?? undefined,
        reason: 'Missing required parameters',
        errorCode: paramValidation.errorCode,
      });
      this.emitErrorAndDisconnect(client, noteId, paramValidation.errorCode!);
      return;
    }

    // 3. JWT + Note 권한 검증
    const authResult = await this.connectionService.authenticateAndAuthorize(
      authToken!,
      noteId!,
    );
    if (!authResult.success) {
      this.logger.warn(`Auth failed for client ${client.id}: ${authResult.message}`);
      this.prometheusService.recordWebSocketConnectionFailure();
      this.prometheusService.recordAuthFailure(authResult.errorCode || 'auth_failed');
      this.securityLogger.logJwtValidationFailure({
        ip: clientIp,
        noteId: noteId ?? undefined,
        reason: authResult.message || 'Authentication failed',
        token: authToken ?? undefined,
      });
      this.emitErrorAndDisconnect(client, noteId, authResult.errorCode!);
      return;
    }

    const userId = authResult.userId!;
    // 인가·룸참가·초기데이터에 정규화된 noteId만 사용한다.
    // 이후 메시지 핸들러의 authorizedNoteId 문자열 비교가 순수 정수 기준이 되어
    // "1e3" 같은 비정규 표기가 Redis 키/인덱스로 흘러드는 경로가 사라진다.
    const authorizedNoteId = authResult.noteId!;
    (client.data as any).user = authResult.payload;
    (client.data as any).authorizedNoteId = authorizedNoteId;
    this.logger.log(`Client ${client.id} authenticated as userId [${userId}]`);

    // 4. 세션 등록 (연결 제한 처리)
    const oldestSocket = await this.connectionService.registerSession(
      userId,
      this.instanceId,
      client.id,
    );
    if (oldestSocket) {
      await this.redisService.publish(
        Constants.DISCONNECT_SOCKET_CHANNEL,
        `${oldestSocket}:${DisconnectReason.CONNECTION_LIMIT}`,
      );
      this.securityLogger.logConnectionLimitExceeded({
        ip: clientIp,
        userId: parseInt(userId, 10) || undefined,
        currentConnections: Number(Constants.MAX_CONNECTIONS_PER_USER) + 1, // max + 1 new
        maxConnections: Number(Constants.MAX_CONNECTIONS_PER_USER),
      });
    }

    // 세션 등록 감사 로그 (해제 로깅과 대칭 — 동시 세션 수 포함)
    const totalSessions = await this.redisService.zcard(`user:${userId}:sockets`);
    this.securityLogger.logSessionRegistered({
      ip: clientIp,
      userId: parseInt(userId, 10) || undefined,
      noteId: noteId ?? undefined,
      sessionId: client.id,
      totalSessions,
    });

    // 5. Room 참가 + 초기 데이터 전송 (정규화된 noteId 사용)
    await this.joinNoteRoom(client, authorizedNoteId);

    // 6. 메트릭 기록 (성공)
    this.prometheusService.incrementWebSocketConnection();
    this.prometheusService.recordAuthSuccess();
    this.securityLogger.logAuthSuccess({
      ip: clientIp,
      userId: parseInt(userId, 10) || undefined,
      noteId: noteId ?? undefined,
    });
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // 메트릭 기록 (연결 종료)
    this.prometheusService.decrementWebSocketConnection();

    // status 토큰 버킷 정리 (메모리 누수 방지)
    this.statusRateBuckets.delete(client.id);

    // Redis 세션 정리
    const userId = (client.data as any).user?.user_id;
    if (userId) {
      await this.connectionService.unregisterSession(
        userId,
        this.instanceId,
        client.id,
      );
      this.securityLogger.logSessionUnregistered({
        ip: this.getClientIp(client),
        userId: parseInt(userId, 10) || undefined,
        noteId: (client.data as any).authorizedNoteId,
        sessionId: client.id,
        reason: 'client_disconnect',
      });
    }

    // socket.io는 disconnect 시 소켓을 모든 룸에서 자동 제거하므로 별도 leave 불필요
  }

  // ─────────────────────────────────────────────────────────────
  // Message Handlers
  // ─────────────────────────────────────────────────────────────

  @SubscribeMessage('update')
  async handleUpdateNoteData(
    @MessageBody() data: UpdateNoteData,
    @ConnectedSocket() client: Socket,
  ) {
    // H3: Redis 일시 오류로 생긴 미처리 예외가 exitOnError로 인스턴스를 종료시키던
    // 것을 막는다. 실패해도 로깅·메트릭만 남기고 이 편집 메시지만 버린다.
    try {
      await this.handleUpdateNoteDataCore(data, client);
    } catch (error) {
      this.logger.error(
        `handleUpdateNoteData failed for ${client.id}: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      this.prometheusService.recordWebSocketMessage('update', false);
    }
  }

  private async handleUpdateNoteDataCore(
    data: UpdateNoteData,
    client: Socket,
  ) {
    // 데이터 타입/길이 검증 + XSS sanitize
    const dataValidation = validateUpdateNoteData(data);
    if (!dataValidation.success) {
      this.logger.warn(`Data validation failed from client ${client.id}: ${dataValidation.message}`);
      this.prometheusService.recordWebSocketMessage('update', false);
      this.emitErrorAndDisconnect(client, data?.noteId, dataValidation.errorCode!);
      return;
    }

    // sanitize된 데이터 사용
    const sanitizedData = dataValidation.sanitizedData!;
    const { noteId, segmentId, sectionId, type, updatedBy } = sanitizedData;

    // 공통 인증/인가 검증
    const authResult = await this.validateAuthAndAuthorization(client, noteId, updatedBy);
    if (!authResult.success) {
      this.prometheusService.recordWebSocketMessage('update', false);
      this.emitErrorAndDisconnect(client, authResult.noteId, authResult.errorCode);
      return;
    }

    // sanitize 과정에서 실제 주입 신호가 잡혔으면 보안 로그 기록
    this.logXssDetections(client, noteId, updatedBy, dataValidation.xssDetections);

    // Redis 키 생성
    const redisKey = this.buildRedisKey(noteId, type, segmentId, sectionId);
    if (!redisKey) {
      this.logger.error(`Invalid key type or missing id: ${type}`);
      this.prometheusService.recordWebSocketMessage('update', false);
      return;
    }

    // Redis에 sanitize된 노트 데이터 저장 (만료는 키 자체 TTL로 처리)
    // 'expiry_keys' ZSET 기록은 1de1025에서 소비자가 제거된 뒤 쓰기만 남아
    // 무한 증가하던 고아 코드라 제거함
    await this.redisService.set(redisKey, JSON.stringify(sanitizedData), Constants.NOTE_DATA_TTL_SECONDS);

    // 인덱스 관리
    await this.redisService.sadd('note:index', noteId);
    if (type === 'segment' && segmentId) {
      await this.redisService.sadd(`note:{${noteId}}:segment:index`, segmentId);
    } else if (type === 'summary_text' && sectionId) {
      await this.redisService.sadd(`note:{${noteId}}:summary_text:index`, sectionId);
    }

    // 브로드캐스트
    await this.broadcastToNote(noteId, 'updateData', sanitizedData, type);

    // 메트릭 기록 (성공)
    this.prometheusService.recordWebSocketMessage('update', true);
  }

  @SubscribeMessage('status')
  async handleWorking(
    @MessageBody() data: WorkingStatus,
    @ConnectedSocket() client: Socket,
  ) {
    // H3: Redis 일시 오류로 생긴 미처리 예외가 exitOnError로 인스턴스를 종료시키던
    // 것을 막는다. 실패해도 로깅·메트릭만 남기고 이 status 메시지만 버린다.
    try {
      await this.handleWorkingCore(data, client);
    } catch (error) {
      this.logger.error(
        `handleWorking failed for ${client.id}: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      this.prometheusService.recordWebSocketMessage('status', false);
    }
  }

  private async handleWorkingCore(data: WorkingStatus, client: Socket) {
    const { noteId, segmentId, sectionId, speakerId, type, status, userId } = data;

    // ── MED-1: status 4-layer in-memory 가드 (Redis RTT 없음) ──
    // handleConnection에서 저장된 권한 정보(client.data)만으로 검증한다.

    // (1) noteId scope guard — 인증된 note 외 브로드캐스트 차단(cross-note 방지)
    const authorizedNoteId = (client.data as any).authorizedNoteId;
    if (!noteId || noteId !== authorizedNoteId) {
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }

    // (2) JWT 만료 검증 — 메모리에 저장된 payload만 사용(재검증/Redis 없음)
    const jwtPayload = (client.data as any).user;
    if (!jwtPayload) {
      // 인증 정보가 없는 비정상 연결 — 즉시 차단
      this.prometheusService.recordWebSocketMessage('status', false);
      this.emitErrorAndDisconnect(client, noteId, ErrorCode.AUTH_MISSING_TOKEN);
      return;
    }
    const expiryValidation = validateTokenExpiry(jwtPayload);
    if (!expiryValidation.success) {
      this.prometheusService.recordWebSocketMessage('status', false);
      this.emitErrorAndDisconnect(client, noteId, expiryValidation.errorCode!);
      return;
    }

    // (3) impersonation guard — user-supplied userId가 토큰 user_id와 일치해야 함
    // (user_id는 number일 수 있어 String() 변환 후 비교 - validateTokenUser와 동일 규칙)
    const tokenUserId = String(jwtPayload?.user_id ?? '');
    if (!tokenUserId || String(userId ?? '') !== tokenUserId) {
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }

    // (4) lock-flood guard — per-socket 토큰 버킷
    if (!this.tryConsumeStatusToken(client.id)) {
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }

    // (5) R5: per-user 토큰 버킷 — 다중 소켓으로 per-socket 상한을 우회하는 것을 차단
    if (!this.tryConsumeUserStatusToken(tokenUserId)) {
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }

    // ── type/status 화이트리스트 + 선택 ID 형식·길이 검증 ──
    if (!ALLOWED_STATUS_TYPES.has(type)) {
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }
    if (!ALLOWED_STATUS_VALUES.has(status)) {
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }
    // segmentId/sectionId는 Redis 키·스케줄러 파싱과 동일하게 숫자만, speakerId는 sp_N만.
    if (
      segmentId !== undefined &&
      (segmentId.length > STATUS_ID_MAX_LENGTH || !/^\d+$/.test(segmentId))
    ) {
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }
    if (
      sectionId !== undefined &&
      (sectionId.length > STATUS_ID_MAX_LENGTH || !/^\d+$/.test(sectionId))
    ) {
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }
    if (
      speakerId !== undefined &&
      (speakerId.length > STATUS_ID_MAX_LENGTH || !/^sp_\d+$/.test(speakerId))
    ) {
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }

    // type별 필수 ID
    if (type === 'segment' && !segmentId) {
      this.logger.error('segmentId is required for segment key type');
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }
    if (type === 'speaker_alias' && !speakerId) {
      this.logger.error('speakerId is required for speaker_alias type');
      this.prometheusService.recordWebSocketMessage('status', false);
      return;
    }

    // 화이트리스트 재조립 — 검증된 필드 + 서버 생성 socketId만 브로드캐스트한다.
    // (원시 data spread를 제거해 미검증 필드가 pub/sub로 증폭되는 경로를 차단)
    const broadcastData: WorkingStatus & { socketId: string } = {
      noteId,
      type,
      status,
      userId,
      ...(segmentId !== undefined && { segmentId }),
      ...(sectionId !== undefined && { sectionId }),
      ...(speakerId !== undefined && { speakerId }),
      socketId: client.id,
    };
    await this.broadcastToNote(noteId, 'workStatus', broadcastData, type, client.id);

    // 메트릭 기록 (성공)
    this.prometheusService.recordWebSocketMessage('status', true);
  }

  @SubscribeMessage('setSpeaker')
  async handleSetSpeaker(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    // 1. type + payload 검증 (XSS sanitize 포함)
    const dataValidation = validateSetSpeakerData(data);
    if (!dataValidation.success) {
      this.logger.warn(`SetSpeaker validation failed from client ${client.id}: ${dataValidation.message}`);
      this.prometheusService.recordWebSocketMessage('setSpeaker', false);
      this.emitErrorAndDisconnect(client, data?.noteId, dataValidation.errorCode!);
      return;
    }

    const sanitizedData = dataValidation.sanitizedData!;
    const { noteId, type, updatedBy, payload } = sanitizedData;

    // 2. 공통 인증/인가 검증
    const authResult = await this.validateAuthAndAuthorization(client, noteId, updatedBy);
    if (!authResult.success) {
      this.prometheusService.recordWebSocketMessage('setSpeaker', false);
      this.emitErrorAndDisconnect(client, authResult.noteId, authResult.errorCode);
      return;
    }

    // 화자명 sanitize 과정에서 실제 주입 신호가 잡혔으면 보안 로그 기록
    this.logXssDetections(client, noteId, updatedBy, dataValidation.xssDetections);

    try {
      const expiryTimestamp = Math.floor(Date.now() / 1000) + Constants.NOTE_DATA_TTL_SECONDS;
      const speakerIndexKey = 'note:speaker:index';

      // 스케줄러가 DB 기록 시 SQL 레벨 소유권(user_id)을 강제할 수 있도록
      // 편집자(updatedBy=노트 소유자)를 노트별 키에 저장한다. 인가 통과 시점의
      // 세션 사용자만 기록되므로 파싱 발산·비인가 경로가 있어도 타인 노트를 건드릴 수 없다.
      // 같은 해시태그 {noteId}라 speaker 키들과 동일 슬롯(cluster-safe).
      const updaterKey = `note:{${noteId}}:speaker:updater`;
      await this.redisService.set(updaterKey, updatedBy, Constants.NOTE_DATA_TTL_SECONDS);

      if (type === 'add') {
        // 3-1. 화자 추가: Redis HASH + ZSET + INDEX를 원자적으로 저장
        const addSpeakerKey = `note:{${noteId}}:speaker:add`;
        const addSpeakerExpiryKey = `note:{${noteId}}:speaker:add:expiry`;
        const { speakerId, name } = payload;
        await this.redisService.hsetWithExpiry(
          addSpeakerKey, addSpeakerExpiryKey, speakerIndexKey,
          speakerId, name, expiryTimestamp, noteId,
        );
      } else if (type === 'segment') {
        // 3-2. segment speaker 변경: 여러 항목을 원자적으로 저장
        const segmentSpeakerKey = `note:{${noteId}}:speaker:segment`;
        const segmentSpeakerExpiryKey = `note:{${noteId}}:speaker:segment:expiry`;
        await this.redisService.hmsetWithExpiry(
          segmentSpeakerKey, segmentSpeakerExpiryKey, speakerIndexKey,
          payload as Record<string, string>, expiryTimestamp, noteId,
        );
      } else if (type === 'merge') {
        // 3-3. 화자 병합: 여러 항목을 원자적으로 저장
        const mergeSpeakerKey = `note:{${noteId}}:speaker:merge`;
        const mergeSpeakerExpiryKey = `note:{${noteId}}:speaker:merge:expiry`;
        await this.redisService.hmsetWithExpiry(
          mergeSpeakerKey, mergeSpeakerExpiryKey, speakerIndexKey,
          payload as Record<string, string>, expiryTimestamp, noteId,
        );
      } else if (type === 'alias') {
        // 3-4. 화자명 변경: 여러 항목을 원자적으로 저장
        const aliasSpeakerKey = `note:{${noteId}}:speaker:alias`;
        const aliasSpeakerExpiryKey = `note:{${noteId}}:speaker:alias:expiry`;
        await this.redisService.hmsetWithExpiry(
          aliasSpeakerKey, aliasSpeakerExpiryKey, speakerIndexKey,
          payload as Record<string, string>, expiryTimestamp, noteId,
        );
      }

      // 4. 브로드캐스트 (모든 클라이언트에게 전달)
      this.server.to(`note:${noteId}`).emit('setSpeakerData', sanitizedData);

      // 5. 다른 인스턴스로 전달
      await this.redisService.publish(
        `note:${noteId}:speakers`,
        JSON.stringify({ ...sanitizedData, origin: this.instanceId }),
      );

      // 메트릭 기록 (성공)
      this.prometheusService.recordWebSocketMessage('setSpeaker', true);
    } catch (error) {
      this.logger.error(`Failed to save speaker data (type: ${type}) for note ${noteId}:`, error);
      this.prometheusService.recordWebSocketMessage('setSpeaker', false);
      await this.notifyError(noteId, ErrorCode.DB_UPDATE_FAILURE);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Redis Pub/Sub Handler
  // ─────────────────────────────────────────────────────────────

  async handleRedisMessage(channel: string, message: string) {
    try {
      // disconnect 채널은 afterInit에서 별도 구독하므로 여기선 처리 안함
      if (!message || message === 'undefined' || !message.startsWith('{')) {
        return;
      }

      const parts = channel.split(':');
      if (parts.length < 2) return;

      const noteId = parts[1];
      const data = JSON.parse(message);

      // 같은 인스턴스에서 발행한 메시지는 무시
      if (data?.origin === this.instanceId) return;

      // 채널 타입에 따라 이벤트명 결정
      const channelType = parts[2]; // note:{noteId}:{channelType}
      let event: string;
      if (channelType === 'speakers') {
        event = 'setSpeakerData';
      } else if (data?.status) {
        event = 'workStatus';
      } else {
        event = 'updateData';
      }
      this.server.to(`note:${noteId}`).emit(event, data);
    } catch (error) {
      this.logger.error(`Error handling Redis message: ${error.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Event Handlers (이벤트 기반 통신)
  // ─────────────────────────────────────────────────────────────

  // @OnEvent 리스너는 emit(비동기)로 호출돼 reject 시 unhandled rejection이
  // 된다(notifySave/notifyError 내부 redis publish 실패 등). 핸들러에서 삼켜 로깅한다.
  @OnEvent(NOTE_EVENTS.SAVED)
  async handleNoteSavedEvent(event: NoteSavedEvent) {
    try {
      await this.notifySave(event.noteId);
    } catch (error) {
      this.logger.error(`handleNoteSavedEvent failed for noteId ${event.noteId}:`, error);
    }
  }

  @OnEvent(NOTE_EVENTS.ERROR)
  async handleNoteErrorEvent(event: NoteErrorEvent) {
    try {
      await this.notifyError(event.noteId, event.errorCode, undefined, event.type);
    } catch (error) {
      this.logger.error(`handleNoteErrorEvent failed for noteId ${event.noteId}:`, error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public Methods (외부에서 호출)
  // ─────────────────────────────────────────────────────────────

  private async notifySave(noteId: string) {
    const data = {
      noteId,
      status: 'save' as const,
      userId: 'system',
    };

    // 로컬 클라이언트에게 전달
    this.server.to(`note:${noteId}`).emit('workStatus', data);

    // 다른 인스턴스로 전달 (status 전용 채널)
    await this.redisService.publish(
      `note:${noteId}:status`,
      JSON.stringify({ ...data, origin: this.instanceId }),
    );
  }

  private async notifyError(noteId: string, errorCode: ErrorCode, retryAfterMs?: number, type?: NoteDataType) {
    let message = getErrorMessage(errorCode);

    // %s 플레이스홀더가 있고 retryAfterMs가 있으면 초 단위로 변환하여 대체
    if (retryAfterMs !== undefined && message.includes('%s')) {
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      message = message.replace('%s', String(retryAfterSec));
    }

    const data = {
      noteId,
      code: errorCode,
      message,
      status: 'error' as const,
      userId: 'system',
      ...(retryAfterMs !== undefined && { retryAfterMs }),
      ...(type !== undefined && { type }),
    };

    this.server.to(`note:${noteId}`).emit('workStatus', data);

    await this.redisService.publish(
      `note:${noteId}:status`,
      JSON.stringify({ ...data, origin: this.instanceId }),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Cron Jobs
  // ─────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleSessionCleanup() {
    // 이 크론만 try/catch가 없어 Redis 일시 오류(commandTimeout·페일오버)가
    // unhandled rejection → Winston rejectionHandlers(exitOnError) → 프로세스 종료로
    // 번져 인스턴스 전체 소켓이 끊겼다. 다른 스케줄러와 동일하게 로깅 후 다음 주기에 맡긴다.
    try {
      const now = Date.now();

      const expiredSockets = await this.redisService.zrangebyscore(
        Constants.GLOBAL_SESSION_EXPIRY_KEY,
        0,
        now,
      );

      if (expiredSockets.length > 0) {
        for (const socketIdentifier of expiredSockets) {
          await this.redisService.publish(
            Constants.DISCONNECT_SOCKET_CHANNEL,
            `${socketIdentifier}:${DisconnectReason.SESSION_EXPIRED}`,
          );
        }
        await this.redisService.zrem(Constants.GLOBAL_SESSION_EXPIRY_KEY, expiredSockets);
      }
    } catch (error) {
      this.logger.warn(
        `Session cleanup cron failed (will retry next cycle): ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * 공통 인증/인가 검증 로직
   * - JWT 토큰 검증
   * - 사용자 일치 확인
   * - 토큰 만료 확인
   * - noteId 권한 재검증
   * - Rate Limiting
   * @returns { success: true } 또는 { success: false, errorCode, noteId }
   */
  private async validateAuthAndAuthorization(
    client: Socket,
    noteId: string,
    updatedBy: string,
  ): Promise<{ success: true } | { success: false; errorCode: ErrorCode; noteId: string }> {
    // 1. HttpOnly 쿠키에서 토큰 추출
    const token = this.connectionService.extractTokenFromClient(client);
    if (!token) {
      this.logger.warn(`No token found in cookie from client ${client.id}`);
      return { success: false, errorCode: ErrorCode.AUTH_MISSING_TOKEN, noteId };
    }

    // 2. JWT 검증
    const jwtResult = await verifyJwtToken(this.jwtService, token);
    if (!jwtResult.success) {
      this.logger.warn(`Invalid token from client ${client.id}: ${jwtResult.message}`);
      return { success: false, errorCode: jwtResult.errorCode ?? ErrorCode.INVALID_JWT_TOKEN, noteId };
    }

    const jwtPayload = jwtResult.payload;

    // 3. updatedBy와 토큰의 user_id 일치 확인
    const userValidation = validateTokenUser(jwtPayload, updatedBy);
    if (!userValidation.success) {
      this.logger.warn(`Token user mismatch from client ${client.id}`);
      return { success: false, errorCode: userValidation.errorCode ?? ErrorCode.JWT_USER_MISMATCH, noteId };
    }

    // 4. 토큰 만료 확인
    const expiryValidation = validateTokenExpiry(jwtPayload);
    if (!expiryValidation.success) {
      this.logger.warn(`Token expired from client ${client.id}`);
      return { success: false, errorCode: expiryValidation.errorCode ?? ErrorCode.INVALID_JWT_EXPIRED, noteId };
    }

    // 5. noteId 권한 재검증: 연결 시 인가된 noteId와 요청 noteId 비교
    const authorizedNoteId = (client.data as any).authorizedNoteId;
    if (!authorizedNoteId || noteId !== authorizedNoteId) {
      this.logger.warn(`Unauthorized noteId access from client ${client.id}: requested ${noteId}, authorized ${authorizedNoteId}`);
      return { success: false, errorCode: ErrorCode.UNAUTHORIZED_NOTE_ACCESS, noteId };
    }

    // 6. Rate Limiting 체크
    const rateLimitResult = await checkRateLimit(this.redisService, updatedBy);
    if (!rateLimitResult.success) {
      this.logger.warn(`Rate limit exceeded for user ${updatedBy}: ${rateLimitResult.message}`);
      // Rate limit 메트릭 기록
      this.prometheusService.recordRateLimitRejection();
      this.securityLogger.logRateLimitExceeded({
        ip: this.getClientIp(client),
        userId: parseInt(updatedBy, 10) || undefined,
        noteId,
        limit: Number(Constants.RATE_LIMIT_MAX_PER_MINUTE),
        windowMs: Number(Constants.RATE_LIMIT_WINDOW_SECONDS) * 1000,
        requestCount: Number(Constants.RATE_LIMIT_MAX_PER_MINUTE) + 1, // limit 초과
      });
      await this.notifyError(noteId, rateLimitResult.errorCode!, rateLimitResult.retryAfterMs);
      return { success: false, errorCode: rateLimitResult.errorCode!, noteId };
    }

    return { success: true };
  }

  /**
   * status 메시지 전용 per-socket 토큰 버킷 (in-memory, Redis RTT 없음).
   * 정상 사용자의 lock 신호는 통과시키되 lock flood는 차단한다.
   * @returns 토큰 소비 성공(허용) 시 true, 고갈(차단) 시 false
   */
  private tryConsumeStatusToken(socketId: string): boolean {
    const capacity = Number(Constants.STATUS_RATE_BUCKET_CAPACITY);
    const refillPerSec = Number(Constants.STATUS_RATE_BUCKET_REFILL_PER_SEC);
    const now = Date.now();

    let bucket = this.statusRateBuckets.get(socketId);
    if (!bucket) {
      bucket = { tokens: capacity, last: now };
      this.statusRateBuckets.set(socketId, bucket);
    } else {
      // 경과 시간만큼 토큰 충전 (capacity 상한)
      const elapsedSec = (now - bucket.last) / 1000;
      if (elapsedSec > 0) {
        bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
        bucket.last = now;
      }
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * R5: status 메시지 per-user 토큰 버킷 (소켓 무관, in-memory, Redis RTT 없음).
   * per-socket 버킷을 통과해도 사용자당 지속 속도를 캡해 다중 소켓 우회를 막는다.
   * @returns 토큰 소비 성공(허용) 시 true, 고갈(차단) 시 false
   */
  private tryConsumeUserStatusToken(userId: string): boolean {
    const capacity = Number(Constants.STATUS_USER_RATE_BUCKET_CAPACITY);
    const refillPerSec = Number(Constants.STATUS_USER_RATE_BUCKET_REFILL_PER_SEC);
    const maxEntries = Number(Constants.STATUS_USER_RATE_BUCKET_MAX_ENTRIES);
    const now = Date.now();

    let bucket = this.statusRateBucketsByUser.get(userId);
    if (!bucket) {
      // 메모리 상한: 초과 시 가장 오래 미사용된 엔트리부터 제거(LRU 근사)
      if (this.statusRateBucketsByUser.size >= maxEntries) {
        let oldestKey: string | null = null;
        let oldest = Infinity;
        for (const [k, b] of this.statusRateBucketsByUser) {
          if (b.last < oldest) {
            oldest = b.last;
            oldestKey = k;
          }
        }
        if (oldestKey !== null) {
          this.statusRateBucketsByUser.delete(oldestKey);
        }
      }
      bucket = { tokens: capacity, last: now };
      this.statusRateBucketsByUser.set(userId, bucket);
    } else {
      const elapsedSec = (now - bucket.last) / 1000;
      if (elapsedSec > 0) {
        bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
        bucket.last = now;
      }
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  private emitErrorAndDisconnect(
    client: Socket,
    noteId: string | null,
    errorCode: ErrorCode,
  ): void {
    const data = this.connectionService.createErrorResponse(noteId, errorCode);
    client.emit('workStatus', data);
    client.disconnect(true);
  }

  private async joinNoteRoom(client: Socket, noteId: string): Promise<void> {
    client.join(`note:${noteId}`);

    // 초기 데이터 전송
    try {
      const noteData = await this.connectionService.fetchInitialNoteData(noteId);
      const now = Math.floor(Date.now() / 1000);

      // 1. 임시 화자 조회 (add type)
      // Redis HASH에서 임시 화자 목록 조회 (field: speakerId, value: name)
      const tempSpeakers = await this.fetchTempSpeakersFromRedis(noteId, now);

      // 2. segment speaker 임시 데이터 조회 (segment type)
      // Redis HASH에서 segment speaker 조회 (field: segmentId, value: speakerId)
      const segmentSpeakers = await this.fetchSegmentSpeakersFromRedis(noteId, now);

      // 3. 병합 대기 중인 화자 조회 (merge type)
      // Redis HASH에서 병합 대기 화자 조회 (field: sourceId, value: targetId)
      const mergedSpeakers = await this.fetchMergedSpeakersFromRedis(noteId, now);

      // 4. 화자명 변경 대기 중인 데이터 조회 (alias type)
      // Redis HASH에서 alias 조회 (field: speakerId, value: newName)
      const aliasedSpeakers = await this.fetchAliasedSpeakersFromRedis(noteId, now);

      // 5. tempSpeakers에서 병합된 화자(mergedSpeakers의 sourceId) 제외
      const filteredTempSpeakers = Object.fromEntries(
        Object.entries(tempSpeakers).filter(([speakerId]) => !(speakerId in mergedSpeakers)),
      );

      // noteData에 tempSpeakers, segmentSpeakers, mergedSpeakers, aliasedSpeakers 추가
      client.emit('noteData', { ...noteData, tempSpeakers: filteredTempSpeakers, segmentSpeakers, mergedSpeakers, aliasedSpeakers });
    } catch (error) {
      this.logger.error(`Failed to fetch initial note data for noteId ${noteId}:`, error);
      // catch 안에서 await하면 notifyError의 publish 실패가 catch를 다시
      // 탈출한다. void + .catch로 fire-and-forget의 reject를 명시적으로 삼켜 로깅한다.
      void this.notifyError(noteId, ErrorCode.INITIAL_DATA_FETCH_FAILURE).catch((e) =>
        this.logger.error(`notifyError failed for noteId ${noteId}:`, e),
      );
    }
  }

  /**
   * Redis에서 임시 화자 조회 (만료되지 않은 것만)
   */
  private async fetchTempSpeakersFromRedis(noteId: string, now: number): Promise<Record<string, string>> {
    const addSpeakerKey = `note:{${noteId}}:speaker:add`;
    const addSpeakerExpiryKey = `note:{${noteId}}:speaker:add:expiry`;
    const allTempSpeakers = await this.redisService.hgetall(addSpeakerKey);

    if (Object.keys(allTempSpeakers).length === 0) {
      return {};
    }

    const expiredIds = await this.redisService.zrangebyscore(addSpeakerExpiryKey, 0, now);
    const expiredSet = new Set(expiredIds);
    return Object.fromEntries(
      Object.entries(allTempSpeakers).filter(([speakerId]) => !expiredSet.has(speakerId)),
    );
  }

  /**
   * Redis에서 segment speaker 조회 (만료되지 않은 것만)
   */
  private async fetchSegmentSpeakersFromRedis(noteId: string, now: number): Promise<Record<string, string>> {
    const segmentSpeakerKey = `note:{${noteId}}:speaker:segment`;
    const segmentSpeakerExpiryKey = `note:{${noteId}}:speaker:segment:expiry`;
    const allSegmentSpeakers = await this.redisService.hgetall(segmentSpeakerKey);

    if (Object.keys(allSegmentSpeakers).length === 0) {
      return {};
    }

    const expiredIds = await this.redisService.zrangebyscore(segmentSpeakerExpiryKey, 0, now);
    const expiredSet = new Set(expiredIds);
    return Object.fromEntries(
      Object.entries(allSegmentSpeakers).filter(([segmentId]) => !expiredSet.has(segmentId)),
    );
  }

  /**
   * Redis에서 병합 대기 중인 화자 조회 (만료되지 않은 것만)
   * mergedSpeakers: { sourceId: targetId } 형태, sourceId는 병합되어 사라질 화자
   */
  private async fetchMergedSpeakersFromRedis(noteId: string, now: number): Promise<Record<string, string>> {
    const mergeSpeakerKey = `note:{${noteId}}:speaker:merge`;
    const mergeSpeakerExpiryKey = `note:{${noteId}}:speaker:merge:expiry`;
    const allMergedSpeakers = await this.redisService.hgetall(mergeSpeakerKey);

    if (Object.keys(allMergedSpeakers).length === 0) {
      return {};
    }

    const expiredIds = await this.redisService.zrangebyscore(mergeSpeakerExpiryKey, 0, now);
    const expiredSet = new Set(expiredIds);
    return Object.fromEntries(
      Object.entries(allMergedSpeakers).filter(([sourceId]) => !expiredSet.has(sourceId)),
    );
  }

  /**
   * Redis에서 화자명 변경 대기 중인 데이터 조회 (만료되지 않은 것만)
   * aliasedSpeakers: { speakerId: newName } 형태
   */
  private async fetchAliasedSpeakersFromRedis(noteId: string, now: number): Promise<Record<string, string>> {
    const aliasSpeakerKey = `note:{${noteId}}:speaker:alias`;
    const aliasSpeakerExpiryKey = `note:{${noteId}}:speaker:alias:expiry`;
    const allAliasedSpeakers = await this.redisService.hgetall(aliasSpeakerKey);

    if (Object.keys(allAliasedSpeakers).length === 0) {
      return {};
    }

    const expiredIds = await this.redisService.zrangebyscore(aliasSpeakerExpiryKey, 0, now);
    const expiredSet = new Set(expiredIds);
    return Object.fromEntries(
      Object.entries(allAliasedSpeakers).filter(([speakerId]) => !expiredSet.has(speakerId)),
    );
  }

  private getPubsubChannel(noteId: string, type: NoteDataType): string {
    return `note:${noteId}:${this.CHANNEL_MAP[type]}`;
  }

  private async broadcastToNote(
    noteId: string,
    event: string,
    data: any,
    type: NoteDataType,
    excludeSocketId?: string,
  ): Promise<void> {
    // 로컬 클라이언트에게 전달 (excludeSocketId가 있으면 해당 소켓 제외)
    const room = `note:${noteId}`;
    if (excludeSocketId) {
      this.server.to(room).except(excludeSocketId).emit(event, data);
    } else {
      this.server.to(room).emit(event, data);
    }

    // 다른 인스턴스로 전달
    const channel = this.getPubsubChannel(noteId, type);
    await this.redisService.publish(
      channel,
      JSON.stringify({ ...data, origin: this.instanceId }),
    );
  }

  private buildRedisKey(
    noteId: string,
    type: NoteDataType,
    segmentId?: string,
    sectionId?: string,
  ): string | null {
    switch (type) {
      case 'segment':
        if (!segmentId) return null;
        return `note:{${noteId}}:segment:${segmentId}`;
      case 'summary_text':
        if (!sectionId) return null;
        return `note:{${noteId}}:summary_text:${sectionId}`;
      case 'keywords':
        return `note:{${noteId}}:keywords`;
      case 'next_action':
        return `note:{${noteId}}:next_action`;
      case 'main_topic':
        return `note:{${noteId}}:main_topic`;
      default:
        return null;
    }
  }

  private handleDisconnectRequest(message: string): void {
    if (!message) {
      this.logger.warn('Received empty disconnect request message');
      return;
    }

    const parts = message.split(':');
    if (parts.length < 2) {
      this.logger.warn(`Invalid disconnect request format: ${message}`);
      return;
    }

    const targetInstanceId = parts[0];
    const socketId = parts[1];
    const reason = parts[2] as DisconnectReason | undefined;

    if (targetInstanceId === this.instanceId) {
      // NestJS WebSocket Gateway with namespace: this.server는 Namespace 객체
      // Namespace.sockets는 Map<SocketId, Socket>
      const socketsMap = (this.server as any)?.sockets as Map<string, any> | undefined;
      if (!socketsMap) {
        this.logger.warn(`Server sockets not available`);
        return;
      }

      const socketToDisconnect = socketsMap.get(socketId);
      if (socketToDisconnect) {
        const errorCode = reason === DisconnectReason.SESSION_EXPIRED
          ? ErrorCode.SESSION_EXPIRED
          : ErrorCode.CONNECTION_LIMIT_EXCEEDED;

        this.emitErrorToSocket(socketToDisconnect, errorCode);
        socketToDisconnect.disconnect(true);
      } else {
        this.logger.warn(`Socket not found for disconnect: ${socketId}`);
      }
    }
  }

  private emitErrorToSocket(client: Socket, errorCode: ErrorCode): void {
    const data = {
      code: errorCode,
      message: getErrorMessage(errorCode),
      status: 'error' as const,
      userId: 'system',
    };
    client.emit('workStatus', data);
  }

  /**
   * 클라이언트 IP 주소 추출 (프록시 환경 고려)
   *
   * MED-2: X-Forwarded-For는 클라이언트가 임의 위조 가능하다.
   * 게이트웨이(nginx)가 X-Real-IP를 $remote_addr(신뢰 가능한 실제 IP)로
   * 세팅하므로 X-Real-IP를 우선 신뢰한다.
   * X-Forwarded-For는 폴백으로만 사용하되, 신뢰 프록시가 마지막에 append한
   * "가장 오른쪽" 값(마지막 hop)을 취해 위조된 앞쪽 값을 무시한다.
   *
   * 주의: 신뢰 프록시(게이트웨이) 1단을 전제로 한다. sttEdit 포트가
   * 게이트웨이를 거치지 않고 외부에 직접 노출되면 헤더 기반 IP는
   * 근본적으로 신뢰할 수 없으므로 방화벽으로 직접 접근을 차단해야 한다.
   */
  private getClientIp(client: Socket): string {
    const handshake = client.handshake;

    // 1) X-Real-IP (nginx가 $remote_addr로 설정 — 신뢰 가능)
    const realIp = handshake.headers['x-real-ip'];
    if (realIp) {
      const value = Array.isArray(realIp) ? realIp[0] : realIp;
      if (value && value.trim()) {
        return value.trim();
      }
    }

    // 2) X-Forwarded-For 폴백 — 마지막 hop(가장 오른쪽)이 신뢰 프록시가 붙인 값
    const forwardedFor = handshake.headers['x-forwarded-for'];
    if (forwardedFor) {
      const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length > 0) {
        return list[list.length - 1];
      }
    }

    // 3) 직접 연결 IP
    return handshake.address || 'unknown';
  }

  /**
   * 검증 단계에서 잡힌 XSS 시도를 보안 로그에 기록한다.
   * 원본 페이로드는 logXssAttemptDetected 내부에서 해시로만 남긴다(원문 미노출).
   */
  private logXssDetections(
    client: Socket,
    noteId: string,
    userId: string | undefined,
    detections?: XssDetection[],
  ): void {
    if (!detections || detections.length === 0) return;
    const ip = this.getClientIp(client);
    const uid = userId ? parseInt(userId, 10) || undefined : undefined;
    for (const d of detections) {
      this.securityLogger.logXssAttemptDetected({
        ip,
        userId: uid,
        noteId,
        field: d.field,
        originalValue: d.original,
      });
    }
  }
}
