"""
Celery 설정 상수 관리

모든 Celery 관련 타임아웃, 재시도, 임계값 설정을 중앙 관리합니다.
환경별로 다른 값을 사용하려면 환경변수를 통해 오버라이드 가능합니다.
"""
from datetime import timedelta
import os


class CeleryConfig:
    """Celery Task 및 Worker 설정 상수"""

    # ==================== Task 타임아웃 ====================
    # STT Task 기본 타임아웃 (동적 계산의 기본값)
    STT_HARD_TIME_LIMIT = int(os.environ.get('STT_HARD_TIME_LIMIT', 7200))  # 2시간 (초)
    STT_SOFT_TIME_LIMIT = int(os.environ.get('STT_SOFT_TIME_LIMIT', 3600))  # 1시간 (초)

    # Summary Task 타임아웃
    SUMMARY_TIMEOUT = timedelta(minutes=int(os.environ.get('SUMMARY_TIMEOUT_MINUTES', 10)))

    # ==================== 복구 임계값 ====================
    # Worker heartbeat 체크 임계값
    WORKER_HEARTBEAT_THRESHOLD = timedelta(minutes=int(os.environ.get('WORKER_HEARTBEAT_MINUTES', 5)))

    # Stuck task 감지 임계값
    STUCK_TASK_THRESHOLD_STT = timedelta(hours=int(os.environ.get('STUCK_TASK_HOURS_STT', 2)))
    STUCK_TASK_THRESHOLD_SUMMARY = timedelta(minutes=int(os.environ.get('STUCK_TASK_MINUTES_SUMMARY', 10)))

    # ==================== 재시도 설정 ====================
    # 최대 재시도 횟수
    MAX_RETRIES = int(os.environ.get('CELERY_MAX_RETRIES', 3))

    # 재시도 간격 (초)
    RETRY_BACKOFF_BASE = int(os.environ.get('CELERY_RETRY_DELAY', 60))

    # ==================== Task 만료 설정 ====================
    # ProcessingTask 만료 시간
    TASK_EXPIRY = timedelta(hours=int(os.environ.get('TASK_EXPIRY_HOURS', 48)))

    # ==================== Worker 설정 ====================
    # Worker당 최대 task 수 (GPU 메모리 관리)
    WORKER_MAX_TASKS_PER_CHILD = int(os.environ.get('WORKER_MAX_TASKS', 10))

    # Worker prefetch 수 (GPU task는 1개씩 처리)
    WORKER_PREFETCH_MULTIPLIER = int(os.environ.get('WORKER_PREFETCH', 1))


# ==================== Queue 정의 ====================
from kombu import Exchange, Queue
from celery.schedules import crontab

CELERY_TASK_QUEUES = (
    Queue(
        'stt_queue',
        Exchange('stt'),
        routing_key='stt.#'
    ),
    Queue(
        'summary_queue',
        Exchange('summary'),
        routing_key='summary.#'
    ),
    Queue(
        'dlq_queue',  # Dead Letter Queue
        Exchange('dlq'),
        routing_key='dlq.#'
    ),
)

# ==================== Task Routes ====================
CELERY_TASK_ROUTES = {
    # Main tasks (new path)
    'celery_workers.tasks.stt_tasks.process_stt': {
        'queue': 'stt_queue',
        'routing_key': 'stt.process',
    },
    'celery_workers.tasks.summary_tasks.process_summary': {
        'queue': 'summary_queue',
        'routing_key': 'summary.process',
    },

    # Recovery tasks (모두 summary_queue에서 실행)
    'celery_workers.recovery.recover_stuck_tasks': {
        'queue': 'summary_queue',
    },
    'celery_workers.recovery.expire_old_pending_tasks': {
        'queue': 'summary_queue',
    },
    'celery_workers.recovery.monitor_worker_status': {
        'queue': 'summary_queue',
    },
    'celery_workers.recovery.check_queue_health': {
        'queue': 'summary_queue',
    },
    'celery_workers.recovery.process_dlq': {
        'queue': 'summary_queue',
    },
    'celery_workers.recovery.detect_orphaned_tasks': {
        'queue': 'summary_queue',
    },
    'celery_workers.recovery.cleanup_completed_tasks': {
        'queue': 'summary_queue',
    },
    'celery_workers.recovery.cleanup_old_trashed_notes': {
        'queue': 'summary_queue',
    },

    # Heartbeat tasks
    'celery_workers.heartbeat.send_worker_heartbeat': {
        'queue': 'summary_queue',
    },
    'celery_workers.heartbeat.report_worker_metrics': {
        'queue': 'summary_queue',
    },
    # STT(GPU) Worker 전용 heartbeat — stt_queue로 라우팅해 STT 워커가 실행하고
    # worker_type='STT' 하트비트를 기록한다. (send_worker_heartbeat는 summary 전용)
    'celery_workers.heartbeat.send_stt_heartbeat': {
        'queue': 'stt_queue',
    },

    # Notification tasks (summary_queue 재사용 - 추가 워커 불필요)
    'apps.notifications.tasks.send_inquiry_reply_notification': {
        'queue': 'summary_queue',
    },
    'apps.notifications.tasks.cleanup_old_notifications': {
        'queue': 'summary_queue',
    },
}

# ==================== Beat Schedule ====================
CELERY_BEAT_SCHEDULE = {
    'send-worker-heartbeat': {
        'task': 'celery_workers.heartbeat.send_worker_heartbeat',
        'schedule': 60.0,  # 매 1분 (Summary 워커)
    },
    'send-stt-heartbeat': {
        'task': 'celery_workers.heartbeat.send_stt_heartbeat',
        'schedule': 60.0,  # 매 1분 (STT 워커)
    },
    'monitor-worker-status': {
        'task': 'celery_workers.recovery.monitor_worker_status',
        'schedule': 300.0,  # 매 5분
    },
    'recover-stuck-tasks': {
        'task': 'celery_workers.recovery.recover_stuck_tasks',
        'schedule': 300.0,  # 매 5분
    },
    'expire-old-pending-tasks': {
        'task': 'celery_workers.recovery.expire_old_pending_tasks',
        'schedule': crontab(hour='*/6'),  # 매 6시간
    },
    'process-dlq': {
        'task': 'celery_workers.recovery.process_dlq',
        'schedule': 600.0,  # 매 10분
    },
    'detect-orphaned-tasks': {
        'task': 'celery_workers.recovery.detect_orphaned_tasks',
        'schedule': 1800.0,  # 매 30분
    },
    'cleanup-completed-tasks': {
        'task': 'celery_workers.recovery.cleanup_completed_tasks',
        'schedule': crontab(hour=3, minute=0),  # 매일 새벽 3시
    },
    # 휴지통 자동 정리 (매일 KST 04:00)
    # CELERY_TIMEZONE='Asia/Seoul'이라 crontab 시각은 KST 기준이다(과거 주석의 UTC 표기는 오류).
    'cleanup-old-trashed-notes': {
        'task': 'celery_workers.recovery.cleanup_old_trashed_notes',
        'schedule': crontab(hour=4, minute=0),  # 매일 KST 04:00
    },
    # Notification cleanup (매일 KST 04:00)
    # L5: crontab 시각은 KST 기준인데 hour=19로 설정돼, 주석의 의도('새벽 4시 KST')와
    # 달리 KST 19:00에 실행됐다. 문서화된 의도대로 KST 04:00으로 정정한다.
    'cleanup-old-notifications': {
        'task': 'apps.notifications.tasks.cleanup_old_notifications',
        'schedule': crontab(hour=4, minute=0),  # 매일 KST 04:00
    },
}
