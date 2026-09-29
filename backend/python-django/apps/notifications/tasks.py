"""
알림 Celery 태스크

보안 강화:
- Idempotency key로 중복 알림 방지
- 재시도 로직 (max_retries=3)
- 트랜잭션 분리 (인앱 알림 → 이메일)
- 배치 삭제로 테이블 락 방지
"""
import logging
from datetime import timedelta
from smtplib import SMTPException

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.db import transaction, OperationalError
from django.utils import timezone
from django.contrib.contenttypes.models import ContentType

from .models import Notification, NotificationType
from .services.email import send_inquiry_reply_email

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(SMTPException, OperationalError),
    acks_late=True,
)
def send_inquiry_reply_notification(self, inquiry_id, idempotency_key):
    """
    문의 답변 알림 발송 (인앱 + 이메일)

    Args:
        inquiry_id: ContactInquiry PK
        idempotency_key: 중복 방지 키 (inquiry_id:replied_at)

    보안:
        - idempotency_key로 재시도 시 중복 알림 방지
        - 24시간 캐시로 같은 답변에 대한 중복 방지
    """
    # 멱등 키를 인앱/이메일 두 단계로 분리한다.
    # 기존엔 단일 키를 이메일 발송 '전'에 세팅해서, 1차 발송이 실패하고 Celery가
    # 재시도하면 상단 duplicate 체크에 걸려 답변 메일이 영영 발송되지 않았다
    # (autoretry_for가 통째로 무의미). 인앱은 최초 1회만, 이메일은 발송 성공 후에만 마킹한다.
    inapp_key = f"notification_inapp:{idempotency_key}"
    email_key = f"notification_email:{idempotency_key}"

    # 이미 인앱·이메일 모두 처리됐으면 종료
    if cache.get(inapp_key) and cache.get(email_key):
        logger.info(f"Duplicate notification prevented: {idempotency_key}")
        return {'status': 'duplicate', 'inquiry_id': inquiry_id}

    # ContactInquiry 조회 (지연 import로 순환 참조 방지)
    from apps.support.models import ContactInquiry

    try:
        inquiry = ContactInquiry.objects.select_related('user').get(pk=inquiry_id)
    except ContactInquiry.DoesNotExist:
        logger.error(f"ContactInquiry {inquiry_id} not found")
        return {'status': 'error', 'message': 'Inquiry not found'}

    # 답변이 있는지 확인
    if not inquiry.admin_reply:
        logger.warning(f"ContactInquiry {inquiry_id} has no admin reply")
        return {'status': 'error', 'message': 'No admin reply'}

    # 인앱 알림 생성 — 최초 1회만(재시도 시 중복 생성 방지)
    if not cache.get(inapp_key):
        with transaction.atomic():
            notification = Notification.objects.create(
                user=inquiry.user,
                notification_type=NotificationType.INQUIRY_REPLY,
                title='문의에 답변이 등록되었습니다',
                message=f'[{inquiry.subject}] 문의에 대한 답변이 등록되었습니다. 확인해 주세요.',
                content_type=ContentType.objects.get_for_model(ContactInquiry),
                object_id=inquiry.pk,
                action_url='/contact/history',
            )
            cache.set(inapp_key, True, timeout=86400)
            logger.info(f"In-app notification {notification.id} created for inquiry {inquiry_id}")

    # 이메일 발송 (트랜잭션 외부 - 실패해도 인앱 알림은 유지)
    if cache.get(email_key):
        # 이메일은 이미 발송됨(인앱만 남았던 경우) — 재발송 안 함
        return {
            'status': 'success',
            'inquiry_id': inquiry_id,
            'email_sent': True,
        }
    try:
        send_inquiry_reply_email(inquiry)
        # 발송 성공을 확인한 뒤에만 멱등 키를 세팅 → 실패 시 재시도가 살아있음
        cache.set(email_key, True, timeout=86400)
        logger.info(f"Email notification sent for inquiry {inquiry_id}")
    except (SMTPException, OperationalError) as e:
        # autoretry_for 대상 예외는 재발생시켜 Celery 자동 재시도 활성화
        logger.error(f"Email notification failed (will retry) for inquiry {inquiry_id}: {e}")
        raise
    except Exception as e:
        # 그 외 예외는 로깅만 (인앱 알림은 이미 성공)
        logger.error(f"Email notification failed for inquiry {inquiry_id}: {e}")

    return {
        'status': 'success',
        'inquiry_id': inquiry_id,
        'email_sent': True,
    }


@shared_task
def cleanup_old_notifications():
    """
    오래된 알림 정리 (기본 90일)

    성능:
        - 배치 삭제로 테이블 락 방지
        - LIMIT 10000씩 삭제
    """
    retention_days = getattr(settings, 'NOTIFICATION_RETENTION_DAYS', 90)
    cutoff = timezone.now() - timedelta(days=retention_days)
    batch_size = 10000
    total_deleted = 0

    logger.info(f"Starting notification cleanup (retention: {retention_days} days)")

    while True:
        # 배치 단위로 삭제 (테이블 락 방지)
        # Django ORM의 slice는 delete에서 직접 사용 불가하므로 pk 목록 조회 후 삭제
        old_notification_ids = list(
            Notification.objects.filter(created_at__lt=cutoff)
            .values_list('id', flat=True)[:batch_size]
        )

        if not old_notification_ids:
            break

        deleted_count, _ = Notification.objects.filter(id__in=old_notification_ids).delete()
        total_deleted += deleted_count

        logger.info(f"Deleted {deleted_count} old notifications (batch)")

        if deleted_count < batch_size:
            break

    logger.info(f"Notification cleanup completed: {total_deleted} total deleted")
    return {'status': 'success', 'deleted_count': total_deleted}
