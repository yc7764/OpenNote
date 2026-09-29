# celery_workers/tasks/__init__.py
"""
Celery Tasks - Backward Compatibility Layer

기존 코드가 계속 작동하도록 합니다.
Worker별로 분리되어 있어 lazy import 사용.

Usage:
    from celery_workers.tasks import process_stt, process_summary
    from celery_workers.tasks import GPUTask, CPUTask, update_task_status
"""

# CPUTask와 update_task_status는 common에서 (GPU 의존성 없음)
from celery_workers.common.base import CPUTask, update_task_status

__all__ = [
    # Tasks (lazy import)
    'process_stt',
    'process_summary',
    # Task Classes (lazy import)
    'ProcessSTTTask',
    'ProcessSummaryTask',
    # Base
    'GPUTask',
    'CPUTask',
    'update_task_status',
]


def __getattr__(name):
    """Lazy import to avoid loading torch in summary worker"""
    if name in ('process_stt', 'ProcessSTTTask'):
        from .stt_tasks import process_stt, ProcessSTTTask
        return process_stt if name == 'process_stt' else ProcessSTTTask
    elif name in ('process_summary', 'ProcessSummaryTask'):
        from .summary_tasks import process_summary, ProcessSummaryTask
        return process_summary if name == 'process_summary' else ProcessSummaryTask
    elif name == 'GPUTask':
        # GPUTask는 lazy import (torch 필요)
        from celery_workers.gpu.base import GPUTask
        return GPUTask
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
