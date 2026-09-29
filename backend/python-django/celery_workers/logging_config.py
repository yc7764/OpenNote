# celery_workers/logging_config.py
"""
비동기 로깅 설정 (QueueHandler + QueueListener)

dictConfig에서 QueueHandler 인스턴스를 직접 참조할 수 없으므로
프로그래매틱 설정 방식 사용

Features:
- 비동기 로깅 (Worker 스레드 블로킹 없음)
- JSON 형식 로그 (구조화된 쿼리 가능)
- Task context 자동 주입 (task_id, note_id)
- 에러 로그 분리 (celery_errors.log)
- 로그 로테이션 (100MB, 5개 백업)
"""
import logging
import os
import atexit
from logging.handlers import QueueHandler, QueueListener, RotatingFileHandler
from queue import Queue

try:
    from pythonjsonlogger import jsonlogger
    HAS_JSON_LOGGER = True
except ImportError:
    HAS_JSON_LOGGER = False

try:
    from celery._state import get_current_task
    HAS_CELERY = True
except ImportError:
    HAS_CELERY = False

try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

# Global state
_log_queue = None
_queue_listener = None
_is_initialized = False


class TaskContextFilter(logging.Filter):
    """Celery task context를 로그에 자동 주입"""

    def filter(self, record):
        if HAS_CELERY:
            current_task = get_current_task()

            if current_task and current_task.request:
                record.task_id = current_task.request.id
                record.task_name = current_task.name
                # args에서 note_id 추출 (첫 번째 인자)
                if current_task.request.args:
                    record.note_id = current_task.request.args[0]
                else:
                    record.note_id = None
                record.attempt = current_task.request.retries + 1
            else:
                record.task_id = None
                record.task_name = None
                record.note_id = None
                record.attempt = None
        else:
            record.task_id = None
            record.task_name = None
            record.note_id = None
            record.attempt = None

        return True


if HAS_JSON_LOGGER:
    class CustomJsonFormatter(jsonlogger.JsonFormatter):
        """커스텀 JSON 포맷터"""

        def add_fields(self, log_record, record, message_dict):
            super().add_fields(log_record, record, message_dict)

            # 기본 필드
            log_record['timestamp'] = record.created
            log_record['level'] = record.levelname
            log_record['logger'] = record.name

            # Task context 필드
            for field in ['task_id', 'task_name', 'note_id', 'attempt']:
                if hasattr(record, field):
                    log_record[field] = getattr(record, field)
else:
    class CustomJsonFormatter(logging.Formatter):
        """Fallback 포맷터 (python-json-logger 미설치 시)"""

        def __init__(self, *args, **kwargs):
            super().__init__(
                '%(asctime)s - %(levelname)s - %(name)s - %(message)s',
                *args, **kwargs
            )


def setup_async_logging(worker_type='default'):
    """
    워커 타입별 비동기 로깅 설정

    Args:
        worker_type: 'stt_worker' | 'summary_worker' | 'beat' | 'default'

    Returns:
        bool: 설정 성공 여부
    """
    global _log_queue, _queue_listener, _is_initialized

    # 이미 설정된 경우 스킵
    if _is_initialized:
        return True

    # 로그 디렉토리 설정
    log_dir = os.environ.get(
        'CELERY_LOG_DIR',
        os.path.join(os.path.dirname(__file__), '..', 'logs')
    )
    os.makedirs(log_dir, exist_ok=True)

    # 큐 생성 (무제한)
    _log_queue = Queue(-1)

    # Formatter 및 Filter
    task_filter = TaskContextFilter()

    if HAS_JSON_LOGGER:
        json_formatter = CustomJsonFormatter()
    else:
        # Fallback: 일반 포맷터
        json_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )

    # ===== File Handlers (QueueListener에서 사용) =====

    # Worker별 로그 파일
    json_handler = RotatingFileHandler(
        os.path.join(log_dir, f'{worker_type}.log'),
        maxBytes=100 * 1024 * 1024,  # 100MB
        backupCount=5
    )
    json_handler.setFormatter(json_formatter)
    json_handler.addFilter(task_filter)
    json_handler.setLevel(logging.INFO)

    # 에러 전용 로그 파일
    error_handler = RotatingFileHandler(
        os.path.join(log_dir, 'celery_errors.log'),
        maxBytes=100 * 1024 * 1024,  # 100MB
        backupCount=10
    )
    error_handler.setFormatter(json_formatter)
    error_handler.addFilter(task_filter)
    error_handler.setLevel(logging.ERROR)

    # ===== Console Handler (직접 연결) =====

    console_handler = logging.StreamHandler()
    console_formatter = logging.Formatter(
        '{levelname} {asctime} [{name}] {message}',
        style='{'
    )
    console_handler.setFormatter(console_formatter)
    console_handler.addFilter(task_filter)
    console_handler.setLevel(logging.INFO)

    # ===== Queue Handler (메인 스레드 → 큐) =====

    queue_handler = QueueHandler(_log_queue)

    # ===== QueueListener 시작 (별도 스레드) =====

    _queue_listener = QueueListener(
        _log_queue,
        json_handler,
        error_handler,
        respect_handler_level=True
    )
    _queue_listener.start()

    # ===== 로거 설정 =====

    # Root 로거
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(queue_handler)

    # Celery 로거
    celery_logger = logging.getLogger('celery')
    celery_logger.setLevel(logging.INFO)
    celery_logger.propagate = False
    celery_logger.addHandler(console_handler)
    celery_logger.addHandler(queue_handler)

    # celery_workers 로거
    workers_logger = logging.getLogger('celery_workers')
    workers_logger.setLevel(logging.INFO)
    workers_logger.propagate = False
    workers_logger.addHandler(console_handler)
    workers_logger.addHandler(queue_handler)

    # 종료 시 자동 정리
    atexit.register(shutdown_logging)

    _is_initialized = True
    return True


def shutdown_logging():
    """Worker shutdown 시 호출 - QueueListener 정리"""
    global _queue_listener, _is_initialized

    if _queue_listener:
        _queue_listener.stop()
        _queue_listener = None

    _is_initialized = False


logger = logging.getLogger(__name__)
