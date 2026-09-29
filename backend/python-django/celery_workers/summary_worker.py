# celery_workers/summary_worker.py
"""Summary 전용 Celery Worker Application

CPU/API 집약적 작업 전용:
- LLM API를 사용한 요약 생성 (Groq, Gemini, Mistral)
- concurrency=4 (I/O 병렬 처리)

Note: GPU 의존성 없음 - common/ 모듈만 사용

Usage:
    celery -A celery_workers.summary_worker worker -Q summary_queue -c 4 --loglevel=info
"""
import os
import logging
from celery import Celery

# Django 설정 로드
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.worker')

import django
django.setup()


def validate_llm_api_keys():
    """
    LLM API 키 검증

    최소 1개 이상의 API 키가 설정되어 있어야 함.
    설정된 프로바이더 목록을 로깅.
    """
    api_keys = {
        'Groq': 'GROQ_API_KEY',
        'Gemini': 'GOOGLE_API_KEY',
        'Mistral': 'MISTRAL_API_KEY',
    }

    available = []
    missing = []
    for name, env_var in api_keys.items():
        if os.environ.get(env_var):
            available.append(name)
        else:
            missing.append(name)

    logger = logging.getLogger(__name__)

    if not available:
        logger.error(
            "No LLM API keys configured! "
            f"Set at least one of: {', '.join(api_keys.values())}"
        )
        raise EnvironmentError(
            "Summary Worker requires at least one LLM API key. "
            f"Configure one of: {', '.join(api_keys.values())}"
        )

    logger.info(f"LLM Providers - Available: [{', '.join(available)}], Missing: [{', '.join(missing)}]")


# Worker 시작 시 API 키 검증
validate_llm_api_keys()

# 비동기 로깅 초기화
from celery_workers.logging_config import setup_async_logging
setup_async_logging('summary_worker')

# Celery 앱 생성
app = Celery('summary_worker')
app.config_from_object('django.conf:settings', namespace='CELERY')

# Summary 전용 설정
app.conf.update(
    # Task Routing
    task_routes={
        'celery_workers.tasks.summary_tasks.process_summary': {
            'queue': 'summary_queue',
            'routing_key': 'summary.process'
        },
        # Legacy task name (backward compatibility)
        'gpu_worker.tasks.process_summary': {
            'queue': 'summary_queue',
            'routing_key': 'summary.process'
        }
    },

    # Worker 설정
    worker_prefetch_multiplier=4,      # I/O 병렬 처리
    worker_max_tasks_per_child=50,     # CPU 작업은 더 많이
    worker_concurrency=4,              # 병렬 처리

    # Task 추적
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# 명시적 Task 등록
from celery_workers.tasks.summary_tasks import ProcessSummaryTask
app.register_task(ProcessSummaryTask())

# Summary Worker용 간소화된 Heartbeat (GPU 메트릭 제외)
try:
    from celery.utils.log import get_task_logger
    from django.utils import timezone
    from apps.notes.models import WorkerHeartbeat
    import socket
    import psutil

    logger = get_task_logger(__name__)

    def send_summary_heartbeat():
        """Summary Worker 전용 하트비트 (GPU 메트릭 없음)"""
        try:
            worker_type = 'summary_worker'
            worker_id = f"{socket.gethostname()}_{worker_type}_{os.getpid()}"

            # 메모리 사용률
            memory = psutil.virtual_memory()
            memory_usage = memory.percent

            # 큐 깊이 (RabbitMQ)
            queue_depth = 0
            try:
                from kombu import Connection
                with Connection(app.conf.broker_url) as conn:
                    channel = conn.channel()
                    queue = channel.queue_declare(queue='summary_queue', passive=True)
                    queue_depth = queue.message_count
            except Exception as e:
                logger.warning(f"Failed to get queue depth: {e}")

            # DB 업데이트
            WorkerHeartbeat.objects.update_or_create(
                worker_id=worker_id,
                defaults={
                    'worker_type': 'SUMMARY',
                    'hostname': socket.gethostname(),
                    'status': 'ONLINE',
                    'gpu_utilization': None,  # Summary Worker는 GPU 없음
                    'memory_usage': memory_usage,
                    'queue_depth': queue_depth,
                    'last_heartbeat': timezone.now()
                }
            )

            logger.info(f"Heartbeat sent: {worker_id}, Queue: {queue_depth}")

        except Exception as e:
            logger.error(f"Failed to send heartbeat: {e}", exc_info=True)

    def report_summary_metrics():
        """Summary Worker 메트릭 리포트"""
        try:
            metrics = {
                'hostname': socket.gethostname(),
                'worker_type': 'summary_worker',
                'pid': os.getpid(),
                'memory_percent': psutil.virtual_memory().percent,
                'cpu_percent': psutil.cpu_percent(interval=1),
                'timestamp': timezone.now().isoformat()
            }
            logger.info(f"Worker metrics: {metrics}")
            return metrics
        except Exception as e:
            logger.error(f"Failed to report metrics: {e}", exc_info=True)
            return None

    # Celery task로 래핑
    @app.task(name='celery_workers.heartbeat.send_worker_heartbeat', ignore_result=True)
    def heartbeat_task():
        return send_summary_heartbeat()

    @app.task(name='celery_workers.heartbeat.report_worker_metrics', ignore_result=True)
    def metrics_task():
        return report_summary_metrics()

except ImportError as e:
    import logging
    logging.warning(f"Failed to setup heartbeat tasks: {e}")

# Recovery Tasks 등록 (Beat 스케줄에서 summary_queue로 라우팅됨)
try:
    from celery_workers.common.recovery import (
        monitor_worker_status,
        recover_stuck_tasks,
        expire_old_pending_tasks,
        process_dlq,
        detect_orphaned_tasks,
        cleanup_completed_tasks,
        cleanup_old_trashed_notes
    )

    @app.task(name='celery_workers.recovery.monitor_worker_status', ignore_result=True)
    def monitor_task():
        return monitor_worker_status()

    @app.task(name='celery_workers.recovery.recover_stuck_tasks', ignore_result=True)
    def recover_task():
        return recover_stuck_tasks()

    @app.task(name='celery_workers.recovery.expire_old_pending_tasks', ignore_result=True)
    def expire_task():
        return expire_old_pending_tasks()

    @app.task(name='celery_workers.recovery.process_dlq', ignore_result=True)
    def dlq_task():
        return process_dlq()

    @app.task(name='celery_workers.recovery.detect_orphaned_tasks', ignore_result=True)
    def orphaned_task():
        return detect_orphaned_tasks()

    @app.task(name='celery_workers.recovery.cleanup_completed_tasks', ignore_result=True)
    def cleanup_task():
        return cleanup_completed_tasks()

    @app.task(name='celery_workers.recovery.cleanup_old_trashed_notes', ignore_result=True)
    def cleanup_trash_task():
        return cleanup_old_trashed_notes()

except ImportError as e:
    import logging
    logging.warning(f"Failed to import recovery tasks: {e}")

# Notification Tasks 등록 (summary_queue로 라우팅됨)
try:
    from apps.notifications.tasks import (
        send_inquiry_reply_notification,
        cleanup_old_notifications,
    )
    logger = logging.getLogger(__name__)
    logger.info("Notification tasks registered successfully")
except ImportError as e:
    import logging
    logging.warning(f"Failed to import notification tasks: {e}")

# Graceful Shutdown 핸들러 등록 (common 모듈 사용 - GPU 의존성 없음)
from celery.signals import worker_ready, worker_shutdown
from celery_workers.common.signals import worker_ready_handler, worker_shutdown_handler

worker_ready.connect(worker_ready_handler)
worker_shutdown.connect(worker_shutdown_handler)

if __name__ == '__main__':
    app.start()
