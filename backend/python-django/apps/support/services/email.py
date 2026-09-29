from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


def send_contact_notification(inquiry):
    """
    관리자에게 새 문의 알림 이메일 발송

    Args:
        inquiry: ContactInquiry 인스턴스
    """
    subject = f"[OpenNote 문의] {inquiry.subject}"

    timestamp = timezone.localtime(inquiry.created_at).strftime('%Y-%m-%d %H:%M:%S')
    user_id = inquiry.user.id if inquiry.user else 'N/A'

    message = f"""========================================
새로운 문의가 접수되었습니다
========================================

[문의 정보]
- 발신자: {inquiry.name}
- 이메일: {inquiry.email}
- 사용자 ID: {user_id}
- 제목: {inquiry.subject}

========================================
[문의 내용]
========================================

{inquiry.message}

========================================
접수 시간: {timestamp}
========================================
"""

    recipient_email = getattr(settings, 'EMAIL_HOST_USER', None)

    if not recipient_email:
        logger.warning('EMAIL_HOST_USER가 설정되지 않아 문의 알림 이메일을 발송하지 못했습니다.')
        return False

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )
        logger.info(f'문의 알림 이메일 발송 완료: {inquiry.id}')
        return True
    except Exception as e:
        logger.error(f'문의 알림 이메일 발송 실패: {inquiry.id}, 오류: {str(e)}')
        return False
