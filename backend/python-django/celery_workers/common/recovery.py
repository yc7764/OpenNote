# celery_workers/common/recovery.py
"""
Task Recovery and Monitoring (GPU 의존성 없음)

- 정체된 Task 복구
- DLQ 처리
- 워커 상태 모니터링
- 고아 Task 감지

Note: Summary Worker에서 사용 가능 (torch 의존성 없음)
"""
from celery.utils.log import get_task_logger
from celery.result import AsyncResult
from django.utils import timezone
from django.db import transaction
from django.core.mail import send_mail
from datetime import timedelta
from amqp.exceptions import NotFound as ChannelError

from apps.notes.models import ProcessingTask, WorkerHeartbeat, Note
from .utils import calculate_stt_time_limit
from config.settings.celery import CeleryConfig

logger = get_task_logger(__name__)


def _get_celery_app():
    """Celery 앱 가져오기 (lazy import) - Summary Worker용"""
    from celery_workers.summary_worker import app
    return app


def resubmit_task(task: ProcessingTask) -> str:
    """Task 재제출 공통 함수

    Args:
        task: 재제출할 ProcessingTask 객체

    Returns:
        새로운 Celery task ID

    Raises:
        ValueError: 알 수 없는 task_type인 경우

    Note:
        - torch 의존성을 피하기 위해 send_task 사용 (직접 import 대신)
        - send_task는 트랜잭션 밖에서 호출 (rollback시 중복 실행 방지)
    """
    app = _get_celery_app()

    # 1. DB 상태 업데이트 (트랜잭션)
    with transaction.atomic():
        task.attempt_count += 1
        task.status = 'PENDING'
        task.started_at = None
        task.expires_at = timezone.now() + timedelta(hours=48)  # 만료 시간 갱신
        task.save()

    # 2. Celery에 task 전송 (트랜잭션 밖 - 실패시 recover_stuck_tasks가 재처리)
    if task.task_type == 'STT':
        # 동적 시간 제한 계산
        if task.note.duration:
            duration_seconds = int(task.note.duration.total_seconds())
            time_limit = calculate_stt_time_limit(duration_seconds)
            soft_time_limit = int(time_limit * 0.8)

            new_result = app.send_task(
                'gpu_worker.tasks.process_stt',  # 레거시 task name 유지
                args=[task.note.id],
                kwargs={'duration_seconds': duration_seconds},
                queue='stt_queue',
                time_limit=time_limit,
                soft_time_limit=soft_time_limit
            )
        else:
            new_result = app.send_task(
                'gpu_worker.tasks.process_stt',  # 레거시 task name 유지
                args=[task.note.id],
                queue='stt_queue'
            )

    elif task.task_type == 'SUMMARY':
        new_result = app.send_task(
            'celery_workers.tasks.summary_tasks.process_summary',
            args=[task.note.id],
            queue='summary_queue'
        )
    else:
        raise ValueError(f"Unknown task type: {task.task_type}")

    # 3. celery_task_id 저장 (실패해도 치명적이지 않음 - 다음 recovery에서 처리)
    try:
        task.celery_task_id = new_result.id
        task.save(update_fields=['celery_task_id'])
    except Exception as e:
        logger.warning(f"Failed to save celery_task_id for task {task.id}: {e}")

    logger.info(
        f"Task {task.id} resubmitted "
        f"(type={task.task_type}, attempt={task.attempt_count}, "
        f"celery_task_id={new_result.id})"
    )

    return new_result.id


def monitor_worker_status():
    """워커 상태 모니터링 (매 5분)"""
    try:
        threshold = timezone.now() - CeleryConfig.WORKER_HEARTBEAT_THRESHOLD

        # 오프라인 워커 감지
        offline_workers = WorkerHeartbeat.objects.filter(
            last_heartbeat__lt=threshold,
            status='ONLINE'
        )

        if offline_workers.exists():
            count = offline_workers.update(status='OFFLINE')
            logger.warning(f"{count} workers marked as OFFLINE")

            # 관리자 알림
            send_admin_alert(f"{count}개 워커가 오프라인 상태입니다.")

    except Exception as e:
        logger.error(f"Worker monitoring failed: {e}", exc_info=True)


def _find_stuck_task_ids(now) -> list:
    """정체된 task ID 목록 조회 (트랜잭션 없이 snapshot)"""
    stuck_ids = []

    # STT task (동적 타임아웃)
    stt_tasks = ProcessingTask.objects.filter(
        status='PROCESSING',
        task_type='STT'
    ).select_related('note')

    for task in stt_tasks:
        if task.note.duration:
            duration_seconds = int(task.note.duration.total_seconds())
            expected_time_limit = calculate_stt_time_limit(duration_seconds)
            timeout_threshold = now - timedelta(seconds=expected_time_limit)
        else:
            timeout_threshold = now - CeleryConfig.STUCK_TASK_THRESHOLD_STT

        if task.started_at and task.started_at < timeout_threshold:
            stuck_ids.append(task.id)

    # Summary task
    summary_timeout = now - CeleryConfig.STUCK_TASK_THRESHOLD_SUMMARY
    summary_stuck_ids = ProcessingTask.objects.filter(
        status='PROCESSING',
        task_type='SUMMARY',
        started_at__lt=summary_timeout
    ).values_list('id', flat=True)

    stuck_ids.extend(list(summary_stuck_ids))
    return stuck_ids


def _process_single_stuck_task(task_id: int, app, now) -> bool:
    """개별 stuck task 처리 (트랜잭션 단위)

    Returns:
        True if task was processed, False if skipped
    """
    try:
        with transaction.atomic():
            # select_for_update로 락 획득 (skip_locked로 이미 처리 중인 것 건너뜀)
            task = ProcessingTask.objects.select_for_update(
                skip_locked=True
            ).filter(id=task_id, status='PROCESSING').select_related('note').first()

            if not task:
                return False  # 이미 다른 프로세스가 처리함

            # Celery 상태 확인
            if task.celery_task_id:
                result = AsyncResult(str(task.celery_task_id), app=app)
                if result.state in ['STARTED', 'RETRY']:
                    logger.info(f"Task {task.id} still running in Celery (state: {result.state})")
                    return False

            # 최대 재시도 체크
            if task.attempt_count >= CeleryConfig.MAX_RETRIES:
                task.status = 'FAILED'
                task.error_message = '최대 복구 시도 횟수 초과'
                task.completed_at = now
                task.save()

                task.note.processing_status = 'failed'
                task.note.error_details = {
                    'reason': 'max_retries_exceeded',
                    'message': '처리 중 문제가 발생했습니다.'
                }
                task.note.save()

                logger.error(f"Task {task.id} marked as FAILED (max retries)")
                return True

        # 트랜잭션 밖에서 resubmit (send_task 호출)
        resubmit_task(task)
        return True

    except Exception as e:
        logger.error(f"Failed to process stuck task {task_id}: {e}", exc_info=True)
        return False


def recover_stuck_tasks():
    """정체된 task 복구 (매 5분)

    개별 task마다 별도 트랜잭션 사용:
    - 긴 트랜잭션으로 인한 블로킹 방지
    - 하나의 실패가 전체에 영향 주지 않음
    """
    try:
        now = timezone.now()
        app = _get_celery_app()

        # 1단계: 후보 조회 (트랜잭션 없이 snapshot)
        stuck_task_ids = _find_stuck_task_ids(now)
        logger.info(f"Found {len(stuck_task_ids)} potentially stuck tasks")

        # 2단계: 개별 트랜잭션으로 각 task 처리
        processed_count = 0
        for task_id in stuck_task_ids:
            if _process_single_stuck_task(task_id, app, now):
                processed_count += 1

        if processed_count > 0:
            logger.info(f"Processed {processed_count} stuck tasks")

    except Exception as e:
        logger.error(f"Task recovery failed: {e}", exc_info=True)


def expire_old_pending_tasks():
    """48시간 이상 PENDING task 만료 (매 6시간)"""
    try:
        app = _get_celery_app()
        # 모델의 expires_at(생성 시 +48h, 재시도 시 +48h로 갱신) 기준으로 만료한다.
        # 과거엔 created_at 기준이라, 재시도로 expires_at만 연장한 태스크가 원래
        # 생성 48h 뒤 스윕에 즉시 EXPIRED+revoke돼 재시도가 불능 루프에 빠졌다.
        now = timezone.now()

        expired_tasks = ProcessingTask.objects.filter(
            status='PENDING',
            expires_at__lt=now
        )

        for task in expired_tasks:
            task.status = 'EXPIRED'
            task.error_message = '처리 시간 초과 (48시간)'
            task.completed_at = timezone.now()
            task.save()

            # Note 상태 업데이트
            note = task.note
            note.processing_status = 'expired'
            note.error_details = {
                'reason': 'timeout',
                'message': '처리 서버를 사용할 수 없어 작업이 취소되었습니다.',
                'retry_available': True
            }
            note.save()

            # Celery task 취소
            if task.celery_task_id:
                app.control.revoke(
                    str(task.celery_task_id),
                    terminate=True
                )

            logger.info(f"Task {task.id} expired (48h timeout)")

    except Exception as e:
        logger.error(f"Task expiration failed: {e}", exc_info=True)


def process_dlq():
    """DLQ 처리 (매 10분)"""
    try:
        app = _get_celery_app()

        # RabbitMQ DLQ에서 메시지 가져오기
        from kombu import Connection
        import json

        with Connection(app.conf.broker_url) as conn:
            channel = conn.channel()

            # DLQ에서 메시지 가져오기 (최대 10개)
            for _ in range(10):
                message = channel.basic_get(queue='dlq_queue')

                if not message:
                    break

                # x-death 헤더 확인
                try:
                    headers = message.properties.get('headers', {})
                    x_death = headers.get('x-death', [])

                    # DLQ 진입 이유 확인
                    death_reason = None
                    if x_death and len(x_death) > 0:
                        death_reason = x_death[0].get('reason')
                        death_count = x_death[0].get('count', 1)
                        original_queue = x_death[0].get('queue', 'unknown')

                        logger.info(
                            f"DLQ message: reason={death_reason}, "
                            f"count={death_count}, queue={original_queue}"
                        )

                    # TTL 만료된 메시지는 재시도하지 않음
                    if death_reason == 'expired':
                        logger.warning("Message expired (TTL), not retrying")
                        channel.basic_ack(message.delivery_tag)
                        continue

                    # 메시지 파싱
                    body = json.loads(message.body)
                    args = body.get('args')

                    if not args or not isinstance(args, list) or len(args) == 0:
                        logger.error(f"Invalid message format: {body}")
                        channel.basic_ack(message.delivery_tag)
                        continue

                    note_id = args[0]

                    if note_id:
                        # ProcessingTask 확인
                        task = ProcessingTask.objects.filter(
                            note_id=note_id,
                            status__in=['PENDING', 'PROCESSING', 'FAILED']
                        ).first()

                        if task and task.attempt_count < 3:
                            # 재시도 가능 - 재큐잉 (공통 함수 사용)
                            logger.info(f"Requeuing DLQ message for note {note_id}")
                            resubmit_task(task)

                        else:
                            # 재시도 불가 - 영구 실패
                            logger.error(f"DLQ message permanently failed for note {note_id}")

                            with transaction.atomic():
                                if task:
                                    task.status = 'FAILED'
                                    task.error_message = 'DLQ 최대 재시도 초과 또는 만료'
                                    task.completed_at = timezone.now()
                                    task.save()

                                # Note 상태 업데이트
                                note = Note.objects.filter(id=note_id).first()
                                if note:
                                    note.processing_status = 'failed'
                                    note.error_details = {
                                        'reason': 'dlq_permanent_failure',
                                        'message': '메시지 처리에 반복적으로 실패했습니다.'
                                    }
                                    note.preview = '처리 실패'
                                    note.save()

                    # DLQ에서 메시지 삭제 (ack)
                    channel.basic_ack(message.delivery_tag)
                    logger.info(f"DLQ message acknowledged for note {note_id}")

                except json.JSONDecodeError as e:
                    logger.error(f"DLQ message format error: {e}", exc_info=True)
                    # 잘못된 형식의 메시지는 거부 (재큐잉 안 함)
                    channel.basic_nack(message.delivery_tag, requeue=False)

                except Exception as e:
                    logger.error(f"DLQ processing error: {e}", exc_info=True)
                    # 처리 실패 시 메시지 재큐잉 (다음 주기에 재시도)
                    channel.basic_nack(message.delivery_tag, requeue=True)

    except ChannelError:
        # dlq_queue가 RabbitMQ에 아직 생성되지 않은 경우 (DLX 메시지가 없으면 정상)
        logger.debug("DLQ queue 'dlq_queue' does not exist yet, skipping")
    except Exception as e:
        logger.error(f"DLQ processing failed: {e}", exc_info=True)


def _process_single_orphaned_task(task_id: int, app, now) -> bool:
    """개별 orphaned task 처리 (트랜잭션 단위)

    Returns:
        True if task was processed, False if skipped
    """
    try:
        with transaction.atomic():
            # select_for_update로 락 획득
            task = ProcessingTask.objects.select_for_update(
                skip_locked=True
            ).filter(
                id=task_id,
                status__in=['PENDING', 'PROCESSING']
            ).select_related('note').first()

            if not task:
                return False  # 이미 다른 프로세스가 처리함

            # Celery 상태 재확인
            if task.celery_task_id:
                result = AsyncResult(str(task.celery_task_id), app=app)

                # PROCESSING인데 Celery에서 PENDING (= 고아)
                if task.status == 'PROCESSING' and result.state == 'PENDING':
                    if task.started_at and task.started_at < now - timedelta(hours=1):
                        logger.warning(f"Orphaned PROCESSING task detected: {task.id}")
                    else:
                        return False  # 아직 1시간 안됨

                # PENDING 상태로 30분 이상 대기
                elif task.status == 'PENDING' and task.created_at < now - timedelta(minutes=30):
                    logger.warning(f"Orphaned PENDING task detected: {task.id}")

                else:
                    return False  # 고아가 아님

        # 트랜잭션 밖에서 resubmit
        resubmit_task(task)
        return True

    except Exception as e:
        logger.error(f"Failed to process orphaned task {task_id}: {e}", exc_info=True)
        return False


def detect_orphaned_tasks():
    """고아 task 감지 (매 30분)

    개별 task마다 별도 트랜잭션 사용:
    - race condition 방지 (select_for_update)
    - 하나의 실패가 전체에 영향 주지 않음
    """
    try:
        app = _get_celery_app()
        now = timezone.now()

        # 1단계: 후보 조회 (트랜잭션 없이 snapshot)
        candidate_ids = list(ProcessingTask.objects.filter(
            status__in=['PENDING', 'PROCESSING'],
            celery_task_id__isnull=False
        ).values_list('id', flat=True))

        logger.info(f"Checking {len(candidate_ids)} tasks for orphaned status")

        # 2단계: 개별 트랜잭션으로 각 task 처리
        orphaned_count = 0
        for task_id in candidate_ids:
            if _process_single_orphaned_task(task_id, app, now):
                orphaned_count += 1

        if orphaned_count > 0:
            logger.info(f"Recovered {orphaned_count} orphaned tasks")

    except Exception as e:
        logger.error(f"Orphaned task detection failed: {e}", exc_info=True)


def cleanup_completed_tasks():
    """완료된 ProcessingTask 정리 (매일 1회)

    SUCCESS 상태의 Task만 30일 후 삭제합니다.
    FAILED/EXPIRED는 디버깅 및 분석용으로 보존합니다.
    """
    try:
        cleanup_threshold = timezone.now() - timedelta(days=30)

        # 성공한 Task만 삭제 (실패/만료는 보존)
        deleted_count, _ = ProcessingTask.objects.filter(
            status='SUCCESS',
            completed_at__lt=cleanup_threshold
        ).delete()

        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} completed ProcessingTasks (30+ days old)")

    except Exception as e:
        logger.error(f"ProcessingTask cleanup failed: {e}", exc_info=True)


def cleanup_old_trashed_notes():
    """오래된 휴지통 노트 정리 (매일 1회)

    30일 이상 휴지통에 있는 노트를 영구 삭제합니다.
    - 샘플 노트는 보호됨
    - 배치 처리로 테이블 락 방지
    - 오디오 파일도 자동 정리 (post_delete signal)

    Performance:
        - BATCH_SIZE 1000으로 테이블 락 방지
        - 개별 실패가 전체 중단하지 않음
    """
    try:
        # 설정값 가져오기 (환경변수로 오버라이드 가능)
        from django.conf import settings
        retention_days = getattr(settings, 'TRASH_RETENTION_DAYS', 30)
        cutoff_date = timezone.now() - timedelta(days=retention_days)

        batch_size = 1000
        total_deleted = 0
        total_failed = 0

        logger.info(
            f"Starting trash cleanup (retention: {retention_days} days, "
            f"cutoff: {cutoff_date.isoformat()})"
        )

        while True:
            # 배치 단위로 ID 조회 (테이블 락 방지)
            old_note_ids = list(
                Note.all_objects.filter(
                    deleted_at__lt=cutoff_date,
                    deleted_at__isnull=False,
                    is_sample=False  # 샘플 노트 보호
                ).values_list('id', flat=True)[:batch_size]
            )

            if not old_note_ids:
                break

            # 개별 노트 삭제 (signal 트리거를 위해)
            batch_deleted = 0
            batch_failed = 0

            for note_id in old_note_ids:
                try:
                    note = Note.all_objects.get(id=note_id)

                    # 방어적 체크: deleted_at가 None이면 건너뛰기
                    if not note.deleted_at:
                        logger.warning(
                            f"Note {note_id} has no deleted_at timestamp, skipping"
                        )
                        continue

                    # 방어적 체크: 샘플 노트 이중 확인
                    if note.is_sample:
                        logger.warning(
                            f"Note {note_id} is sample note, skipping"
                        )
                        continue

                    # 영구 삭제 (오디오 파일 정리 signal 포함)
                    note.hard_delete()
                    batch_deleted += 1

                except Note.DoesNotExist:
                    logger.debug(f"Note {note_id} already deleted, skipping")
                    continue

                except Exception as e:
                    batch_failed += 1
                    logger.error(
                        f"Failed to delete note {note_id}: {e}",
                        exc_info=True,
                        extra={
                            'note_id': note_id,
                            'error_type': type(e).__name__
                        }
                    )
                    continue

            total_deleted += batch_deleted
            total_failed += batch_failed

            logger.info(
                f"Batch processed: {batch_deleted} deleted, "
                f"{batch_failed} failed (batch size: {len(old_note_ids)})"
            )

            if len(old_note_ids) < batch_size:
                break

        logger.info(
            f"Trash cleanup completed: {total_deleted} notes deleted, "
            f"{total_failed} failed (retention: {retention_days} days)"
        )

        # 실패가 많으면 관리자 알림
        if total_failed > 0:
            failure_rate = total_failed / (total_deleted + total_failed) if (total_deleted + total_failed) > 0 else 0
            if failure_rate > 0.1:  # 10% 이상 실패
                send_admin_alert(
                    f"Trash cleanup warning: {total_failed} notes failed to delete "
                    f"({failure_rate*100:.1f}% failure rate)"
                )

        return {
            'status': 'success',
            'deleted_count': total_deleted,
            'failed_count': total_failed,
            'retention_days': retention_days
        }

    except Exception as e:
        logger.error(f"Trash cleanup failed: {e}", exc_info=True)
        send_admin_alert(f"Critical: Trash cleanup task failed - {e}")
        raise


def send_admin_alert(message):
    """관리자에게 이메일 알림"""
    try:
        from django.conf import settings

        admin_emails = getattr(settings, 'ADMIN_EMAILS', [])
        if not admin_emails:
            logger.warning("ADMIN_EMAILS not configured, skipping admin alert")
            return

        send_mail(
            subject='[OpenNote] System Alert',
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=admin_emails,
            fail_silently=False,
        )
        logger.info(f"Admin alert sent: {message}")

    except Exception as e:
        logger.error(f"Failed to send admin alert: {e}", exc_info=True)
