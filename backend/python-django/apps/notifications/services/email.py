"""
알림 이메일 서비스

보안 강화:
- 템플릿에서 autoescape 적용 (XSS 방지)
- 에러 핸들링 및 로깅
"""
import logging
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def send_inquiry_reply_email(inquiry):
    """
    문의 답변 알림 이메일 발송

    Args:
        inquiry: ContactInquiry 인스턴스

    Returns:
        bool: 발송 성공 여부
    """
    if not settings.EMAIL_HOST_USER:
        logger.warning('EMAIL_HOST_USER not configured, skipping email notification')
        return False

    try:
        user = inquiry.user
        context = {
            'user': user,
            'inquiry': inquiry,
            'admin_reply': inquiry.admin_reply,
            'site_name': getattr(settings, 'SITE_NAME', 'OpenNote'),
            'site_url': settings.FRONTEND_URL,  # FRONTEND_URL 직접 사용
        }

        # HTML 이메일 렌더링 (autoescape 적용됨)
        html_message = render_to_string('emails/inquiry_reply.html', context)
        text_message = render_to_string('emails/inquiry_reply.txt', context)

        subject = f'[{context["site_name"]}] 문의에 답변이 등록되었습니다'

        send_mail(
            subject=subject,
            message=text_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=html_message,
            fail_silently=False,
        )

        logger.info(f'Inquiry reply email sent to {user.email} for inquiry {inquiry.pk}')
        return True

    except Exception as e:
        logger.error(f'Failed to send inquiry reply email to {inquiry.user.email}: {e}')
        raise  # Celery 재시도를 위해 예외 재발생
