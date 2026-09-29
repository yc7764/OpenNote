# celery_workers/common/__init__.py
"""
공통 모듈 (GPU 의존성 없음)

Summary Worker에서 사용 가능한 모듈만 포함
"""
from .base import CPUTask, update_task_status
from .signals import (
    cleanup_database_connections,
    register_shutdown_handlers,
    worker_ready_handler,
    worker_shutdown_handler,
    is_shutdown_requested,
)
from .utils import (
    call_mistral_api,
    parse_summary_result,
    cleanup_local_file,
    calculate_summary_time_limit,
)

__all__ = [
    # Base
    'CPUTask',
    'update_task_status',
    # Signals
    'cleanup_database_connections',
    'register_shutdown_handlers',
    'worker_ready_handler',
    'worker_shutdown_handler',
    'is_shutdown_requested',
    # Utils
    'call_mistral_api',
    'parse_summary_result',
    'cleanup_local_file',
    'calculate_summary_time_limit',
]
