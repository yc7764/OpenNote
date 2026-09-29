"""
Celery Application Configuration

This module provides the main Celery application instance.
All Celery configuration is loaded from Django settings (config/settings/celery.py).

Beat Scheduler uses this app to dispatch scheduled tasks.
Recovery tasks are registered here so Beat can properly route them.
"""
import os
from celery import Celery

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.local')

app = Celery('config')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
# - namespace='CELERY' means all celery-related configuration keys
#   should have a `CELERY_` prefix.
#
# All configuration (queues, routes, beat_schedule) is defined in:
# - config/settings/celery.py
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()

# Also discover tasks from celery_workers
app.autodiscover_tasks(['celery_workers', 'celery_workers.tasks'])


# =============================================================================
# Beat 스케줄 태스크에 대한 참고
# =============================================================================
# Beat는 이름·라우팅(settings.task_routes)만으로 태스크를 발행하므로, 여기에
# heartbeat/recovery 태스크를 등록할 필요가 없다. 과거엔 "Beat 라우팅용" 명목으로
# 같은 이름의 no-op(pass) 스텁을 등록했으나, 이 스텁이 워커 프로세스의 레지스트리로
# 새어 들어가 실제 구현(celery_workers.common.recovery / heartbeat)을 가려버려
# heartbeat·자가복구(monitor/recover/expire/dlq/orphaned/cleanup)가 전부 no-op으로
# 실행됐다(하트비트 영구 정지·복구 서브시스템 무력화). 스텁을 제거하고 각 워커가
# 등록하는 실제 구현이 실행되도록 한다.


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task for testing Celery configuration."""
    print(f'Request: {self.request!r}')
