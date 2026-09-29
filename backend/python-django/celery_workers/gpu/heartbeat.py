# celery_workers/gpu/heartbeat.py
"""
GPU Worker Heartbeat Tasks

GPU 워커 상태 모니터링을 위한 하트비트 전송
STT Worker 전용 (GPU 메트릭 포함)
"""
from celery.utils.log import get_task_logger
from django.utils import timezone
from apps.notes.models import WorkerHeartbeat
from .utils import get_gpu_utilization
import socket
import psutil
import os

logger = get_task_logger(__name__)


def _get_celery_app():
    """Celery 앱 가져오기 (lazy import)"""
    from celery_workers.stt_worker import app
    return app


def send_worker_heartbeat():
    """GPU 워커 하트비트 전송 (매 1분)

    Note:
        이 함수는 celery beat에 의해 호출됩니다.
        GPU 메트릭을 포함한 heartbeat를 전송합니다.
    """
    try:
        app = _get_celery_app()
        worker_type = os.environ.get('WORKER_TYPE', 'stt_worker')

        # worker_id에 PID 포함 (같은 서버에서 여러 워커 실행 시 충돌 방지)
        worker_id = f"{socket.gethostname()}_{worker_type}_{os.getpid()}"

        # GPU 사용률
        gpu_util = get_gpu_utilization()

        # 메모리 사용률
        memory = psutil.virtual_memory()
        memory_usage = memory.percent

        # 큐 깊이 (RabbitMQ)
        queue_name = 'stt_queue'
        queue_depth = 0

        try:
            from kombu import Connection
            broker_url = app.conf.broker_url

            with Connection(broker_url) as conn:
                channel = conn.channel()
                queue = channel.queue_declare(queue=queue_name, passive=True)
                queue_depth = queue.message_count
        except Exception as e:
            logger.warning(f"Failed to get queue depth: {e}")

        # DB 업데이트
        WorkerHeartbeat.objects.update_or_create(
            worker_id=worker_id,
            defaults={
                'worker_type': 'STT',
                'hostname': socket.gethostname(),
                'status': 'ONLINE',
                'gpu_utilization': gpu_util,
                'memory_usage': memory_usage,
                'queue_depth': queue_depth,
                'last_heartbeat': timezone.now()
            }
        )

        logger.info(f"Heartbeat sent: {worker_id}, GPU: {gpu_util}%, Queue: {queue_depth}")

    except Exception as e:
        logger.error(f"Failed to send heartbeat: {e}", exc_info=True)


def report_worker_metrics():
    """GPU 워커 상세 메트릭 리포트

    Note:
        Prometheus/Grafana 연동용 메트릭 수집
    """
    try:
        worker_type = os.environ.get('WORKER_TYPE', 'stt_worker')

        metrics = {
            'hostname': socket.gethostname(),
            'worker_type': worker_type,
            'pid': os.getpid(),
            'memory_percent': psutil.virtual_memory().percent,
            'cpu_percent': psutil.cpu_percent(interval=1),
            'timestamp': timezone.now().isoformat()
        }

        # GPU 메트릭
        gpu_util = get_gpu_utilization()
        if gpu_util is not None:
            metrics['gpu_utilization'] = gpu_util

        logger.info(f"Worker metrics: {metrics}")
        return metrics

    except Exception as e:
        logger.error(f"Failed to report metrics: {e}", exc_info=True)
        return None
