# celery_workers/gpu/base.py
"""
GPU 전용 Base Task 클래스

- GPUTask: GPU 작업을 위한 Base Task (자동 메모리 정리)

Note: torch 필수 - STT Worker 전용
"""
import os
import torch
from celery import Task
from celery.utils.log import get_task_logger
from django.db import OperationalError as DBOperationalError

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


class GPUTask(Task):
    """GPU 정리를 자동으로 하는 Base Task

    Features:
        - Task 완료 후 GPU 메모리 자동 정리
        - 자동 재시도 설정 포함
        - GPU 메모리 사용량 로깅
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

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        """Task 완료 후 GPU 메모리 정리"""
        try:
            if torch.cuda.is_available():
                # 정리 전 메모리 사용량 로깅
                allocated_before = torch.cuda.memory_allocated() / 1024**2
                reserved_before = torch.cuda.memory_reserved() / 1024**2

                torch.cuda.empty_cache()

                # 정리 후 메모리 사용량 로깅
                allocated_after = torch.cuda.memory_allocated() / 1024**2
                reserved_after = torch.cuda.memory_reserved() / 1024**2

                logger.info(
                    f"GPU cleanup for task {task_id}: "
                    f"Before({allocated_before:.1f}MB allocated, {reserved_before:.1f}MB reserved) → "
                    f"After({allocated_after:.1f}MB allocated, {reserved_after:.1f}MB reserved)"
                )
        except Exception as e:
            logger.error(f"GPU cleanup failed for task {task_id}: {e}")

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Task 실패 시 로깅"""
        logger.error(f"Task {task_id} failed: {exc}", extra={
            'task_id': task_id,
            'task_args': args,
            'error_type': type(exc).__name__
        })
        super().on_failure(exc, task_id, args, kwargs, einfo)
