# celery_workers/stt_worker.py
"""STT 전용 Celery Worker Application

GPU 집약적 작업 전용:
- Whisper 모델을 사용한 음성 인식
- 화자 분리 (Diarization)
- concurrency=1 (GPU 메모리 충돌 방지)

Note: GPU 의존성 있음 - gpu/ 모듈 사용

Usage:
    celery -A celery_workers.stt_worker worker -Q stt_queue -c 1 --loglevel=info
"""
import os
from celery import Celery

# Django 설정 로드
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.worker')

import django
django.setup()

# 비동기 로깅 초기화
from celery_workers.logging_config import setup_async_logging
setup_async_logging('stt_worker')

# Celery 앱 생성
app = Celery('stt_worker')
app.config_from_object('django.conf:settings', namespace='CELERY')

# STT 전용 설정
app.conf.update(
    # Task Routing
    task_routes={
        'celery_workers.tasks.stt_tasks.process_stt': {
            'queue': 'stt_queue',
            'routing_key': 'stt.process'
        },
    },

    # Worker 설정
    worker_prefetch_multiplier=1,      # GPU 작업은 한 번에 하나씩
    worker_max_tasks_per_child=10,     # 메모리 누수 방지
    worker_concurrency=1,              # GPU 순차 처리

    # Task 추적
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# 명시적 Task 등록 (autodiscover 대신)
from celery_workers.tasks.stt_tasks import ProcessSTTTask
app.register_task(ProcessSTTTask())

# STT(GPU) Worker 전용 heartbeat 등록.
#
# recovery.* 및 heartbeat.send_worker_heartbeat/report_worker_metrics 태스크는
# settings.task_routes에서 summary_queue로 라우팅돼 Summary Worker가 전담하므로
# 여기서 등록하지 않는다. (과거엔 존재하지 않는 celery_workers.gpu.recovery를
# import해 ImportError로 heartbeat 등록까지 통째 스킵됐다 → STT heartbeat 미기록
# → get_worker_status()가 STT를 항상 OFFLINE으로 봐 만료 노트 재시도가 영구 503.)
#
# STT Worker는 stt_queue로 라우팅되는 전용 heartbeat(send_stt_heartbeat)만 등록해
# worker_type='STT' 하트비트를 기록한다.
try:
    from celery_workers.gpu.heartbeat import send_worker_heartbeat

    @app.task(name='celery_workers.heartbeat.send_stt_heartbeat', ignore_result=True)
    def stt_heartbeat_task():
        return send_worker_heartbeat()

except ImportError as e:
    import logging
    logging.warning(f"Failed to register STT heartbeat task: {e}")

# Graceful Shutdown 핸들러 등록 (gpu 모듈 사용 - GPU 메모리 정리 포함)
from celery.signals import worker_ready, worker_shutdown
from celery_workers.gpu.signals import worker_ready_handler, worker_shutdown_handler

worker_ready.connect(worker_ready_handler)
worker_shutdown.connect(worker_shutdown_handler)

if __name__ == '__main__':
    app.start()
