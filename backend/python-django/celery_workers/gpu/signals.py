# celery_workers/gpu/signals.py
"""
Graceful Shutdown Signal Handlers (GPU 전용)

Worker 종료 시 안전한 리소스 정리 및 Task 상태 관리
GPU 메모리 정리 포함 - STT Worker 전용
"""
import torch
from celery.utils.log import get_task_logger
from django.db import connection

logger = get_task_logger(__name__)

# Shutdown flag
_shutdown_requested = False


def is_shutdown_requested():
    """Shutdown이 요청되었는지 확인"""
    return _shutdown_requested


def cleanup_gpu_memory():
    """GPU 메모리 강제 정리"""
    try:
        if torch.cuda.is_available():
            logger.info("Cleaning up GPU memory...")

            # 현재 사용 중인 메모리 확인
            allocated = torch.cuda.memory_allocated() / 1024**2
            reserved = torch.cuda.memory_reserved() / 1024**2
            logger.info(f"GPU Memory before cleanup: Allocated={allocated:.2f}MB, Reserved={reserved:.2f}MB")

            # 캐시 정리
            torch.cuda.empty_cache()
            torch.cuda.synchronize()

            # 정리 후 메모리 확인
            allocated_after = torch.cuda.memory_allocated() / 1024**2
            reserved_after = torch.cuda.memory_reserved() / 1024**2
            logger.info(f"GPU Memory after cleanup: Allocated={allocated_after:.2f}MB, Reserved={reserved_after:.2f}MB")

    except Exception as e:
        logger.error(f"GPU cleanup failed: {e}", exc_info=True)


def cleanup_database_connections():
    """DB 연결 정리"""
    try:
        logger.info("Closing database connections...")
        connection.close()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Database cleanup failed: {e}", exc_info=True)


def register_shutdown_handlers():
    """(비활성) SIGTERM/SIGINT를 가로채지 않는다.

    과거엔 이 함수가 커스텀 종료 핸들러를 signal.signal()로 설치해 전체 PROCESSING
    태스크를 무조건 PENDING으로 롤백(워커 구분이 없어 다른 워커의 진행 중 작업까지
    리셋 → 중복 처리)했다. 중단된 태스크는 acks_late=True + reject_on_worker_lost=True로
    브로커가 해당 건만 자동 재전달하므로 수동 롤백은 불필요하다. 신호 처리는 Celery에
    맡기고, GPU 메모리·DB 정리는 worker_shutdown 신호 핸들러에서만 수행한다.
    __init__ 재노출 호환을 위해 시그니처만 유지한다.
    """
    logger.info("SIGTERM/SIGINT는 Celery 기본 warm shutdown에 위임 (커스텀 롤백 핸들러 비활성)")


def worker_ready_handler(sender, **kwargs):
    """Worker 준비 완료 시 호출되는 핸들러 (Celery worker_ready 신호)"""
    logger.info("Worker ready")


def worker_shutdown_handler(sender, **kwargs):
    """Worker 종료 시 호출되는 핸들러

    Celery의 worker_shutdown 신호에 연결됨
    """
    logger.info("Worker shutting down, performing cleanup...")

    # GPU 메모리 정리
    cleanup_gpu_memory()

    # DB 연결 정리
    cleanup_database_connections()

    logger.info("Worker shutdown cleanup completed")
