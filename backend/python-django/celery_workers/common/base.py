# celery_workers/common/base.py
"""
CPU 전용 Base Task 클래스 및 공통 유틸리티

- CPUTask: CPU 작업을 위한 Base Task (Summary worker용)
- update_task_status: ProcessingTask 상태 업데이트 함수

Note: GPU 의존성 없음 - Summary Worker에서 안전하게 사용 가능
"""
import os
from celery import Task
from celery.utils.log import get_task_logger
from django.db import OperationalError as DBOperationalError
from django.utils import timezone

# Django 설정 로드
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.worker')

import django
from django.apps import apps as _django_apps

# 이미 초기화됐으면 다시 호출하지 않는다.
# django.setup()은 매번 configure_logging()을 실행해 dictConfig로 root 핸들러를
# 통째로 교체한다. 워커 진입점이 setup_async_logging()으로 붙여둔 QueueHandler가
# 그때 사라져 파일 로그가 전혀 남지 않았다(2026-02 이후 logs/*.log 미갱신).
# 이 모듈을 단독으로 import하는 경우를 위해 호출 자체는 유지한다.
if not _django_apps.ready:
    django.setup()

logger = get_task_logger(__name__)


class CPUTask(Task):
    """CPU 작업을 위한 Base Task (Summary worker용)

    Features:
        - 자동 재시도 설정 포함
        - GPU 의존성 없음
    """
    # 자동 재시도 설정
    # (Exception,)은 잘못된 입력·누락 데이터 같은 영구 실패도 백오프 재시도해
    # 워커를 낭비했다. 일시적 오류(네트워크·DB·스토리지 I/O)만 재시도한다.
    autoretry_for = (
        ConnectionError,      # 네트워크 연결 실패 (requests/httpx도 상속)
        TimeoutError,         # 타임아웃
        OSError,              # 소켓·파일 I/O 오류 (IOError 포함)
        DBOperationalError,   # DB 연결·잠금 등 일시 장애
    )
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Task 실패 시 로깅"""
        logger.error(f"Task {task_id} failed: {exc}", extra={
            'task_id': task_id,
            'task_args': args,
            'error_type': type(exc).__name__
        })
        super().on_failure(exc, task_id, args, kwargs, einfo)


def update_task_status(note_id, task_type, status, celery_task_id=None, error_msg=None):
    """ProcessingTask 상태 업데이트

    Args:
        note_id: 노트 ID
        task_type: 'STT' 또는 'SUMMARY'
        status: 새 상태 (PENDING, PROCESSING, SUCCESS, FAILED, EXPIRED, RETRY)
        celery_task_id: Celery task ID (선택적)
        error_msg: 에러 메시지 (선택적)
    """
    from apps.notes.models import ProcessingTask

    try:
        task = ProcessingTask.objects.filter(
            note_id=note_id,
            task_type=task_type
        ).order_by('-created_at').first()

        if not task:
            logger.warning(f"ProcessingTask not found for note {note_id}, type {task_type}")
            return

        task.status = status

        if status == 'PROCESSING':
            task.started_at = timezone.now()
        elif status in ['SUCCESS', 'FAILED', 'EXPIRED']:
            task.completed_at = timezone.now()

        if error_msg:
            task.add_error(error_msg)

        if celery_task_id:
            task.celery_task_id = celery_task_id

        task.save()

        logger.info(f"Updated ProcessingTask {task.id} status to {status}")

    except Exception as e:
        logger.error(f"Failed to update task status: {e}", exc_info=True)
