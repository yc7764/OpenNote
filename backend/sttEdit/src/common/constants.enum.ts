export enum Constants {
    SCHEDULER_LOCK_KEY = 'note-scheduler-lock',
    SCHEDULER_LOCK_TTL = 60,
    TTL_THRESHOLD_SECONDS = 60,
    TTL_EXTENSION_SECONDS = 90,
    MAX_HISTORY_RECORDS = 10,
    NOTE_DATA_TTL_SECONDS = 300,
    SESSION_MAX_AGE_SECONDS = 60 * 60,
    GLOBAL_SESSION_EXPIRY_KEY = 'global:session:expiry',
    DISCONNECT_SOCKET_CHANNEL = 'disconnect-socket',
    MAX_CONNECTIONS_PER_USER = 3,

    // Rate Limiting (분당 60회 제한)
    RATE_LIMIT_WINDOW_SECONDS = 60,
    RATE_LIMIT_MAX_PER_MINUTE = 60,

    // 스케줄러 재시도 설정
    MAX_RETRY_COUNT = 5, // 최대 재시도 횟수
    RETRY_COUNT_TTL_SECONDS = 600, // 재시도 카운터 TTL (10분)

    // Content Sync 스케줄러 설정 (매일 노트 세그먼트 병합)
    CONTENT_SYNC_LOCK_KEY = 'note-content-sync-lock',
    CONTENT_SYNC_LOCK_TTL = 300, // 5분

    // 배치 업데이트 재시도 설정 (exponential backoff)
    BATCH_RETRY_COUNT = 3,
    BATCH_RETRY_BASE_DELAY_MS = 1000, // 1초 → 2초 → 4초

    // status 메시지 in-memory rate limit (lock flood 방지, Redis RTT 없음)
    STATUS_RATE_BUCKET_CAPACITY = 20, // per-socket 버스트 허용량
    STATUS_RATE_BUCKET_REFILL_PER_SEC = 20, // per-socket 초당 충전량(지속 허용 속도)

    // R5: status는 per-socket 제한만 있어 사용자당 다중 소켓(최대 MAX_CONNECTIONS_PER_USER)으로
    // per-user Redis 레이트리밋(update/setSpeaker)을 우회할 수 있었다. 소켓 무관 per-user
    // in-memory 상한을 추가한다. 단일 소켓 지속속도(20/s)보다 약간 높게 잡아 정상 사용은
    // 영향받지 않고 다중 소켓 증폭만 캡한다.
    STATUS_USER_RATE_BUCKET_CAPACITY = 40, // per-user 버스트 허용량
    STATUS_USER_RATE_BUCKET_REFILL_PER_SEC = 25, // per-user 초당 충전량
    STATUS_USER_RATE_BUCKET_MAX_ENTRIES = 10000, // 맵 메모리 상한(초과 시 LRU 제거)
}

export enum DisconnectReason {
    CONNECTION_LIMIT = 'CONNECTION_LIMIT',
    SESSION_EXPIRED = 'SESSION_EXPIRED',
}