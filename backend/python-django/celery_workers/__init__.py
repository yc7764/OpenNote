# celery_workers/__init__.py
"""
Celery Workers Package

분리된 Celery Worker 구조:
- stt_worker: GPU 집약적 STT 작업 (concurrency=1)
- summary_worker: CPU/API 집약적 요약 작업 (concurrency=4)

Usage:
    # STT Worker 시작
    celery -A celery_workers.stt_worker worker -Q stt_queue -c 1

    # Summary Worker 시작
    celery -A celery_workers.summary_worker worker -Q summary_queue -c 4
"""
