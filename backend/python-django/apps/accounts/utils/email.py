"""
이메일 전송 유틸리티 함수들

기존 email_utils.py에서 utils/email.py로 이동됨
모든 이메일 템플릿은 통일된 형식을 사용합니다:
- HTML: emails/_base.html을 상속받는 템플릿
- TXT: 일관된 형식의 텍스트 템플릿
- 변수명: action_url (모든 액션 링크), user_name (사용자 이름)
"""
import logging
from django.template.loader import render_to_string
from django.core.mail import EmailMultiAlternatives
from django.conf import settings

logger = logging.getLogger(__name__)


def _send_template_email(
    subject: str,
    template_name: str,
    context: dict,
    recipient_email: str,
    log_prefix: str = "이메일"
) -> bool:
    """
    템플릿 기반 이메일 전송 공통 함수

    Args:
        subject: 이메일 제목
        template_name: 템플릿 파일명 (확장자 제외, emails/ 경로 제외)
        context: 템플릿 컨텍스트
        recipient_email: 수신자 이메일
        log_prefix: 로그 메시지 prefix

    Returns:
        bool: 전송 성공 여부
    """
    # 텍스트 버전 렌더링
    text_message = render_to_string(f'emails/{template_name}.txt', context)

    # HTML 버전 렌더링
    html_message = render_to_string(f'emails/{template_name}.html', context)

    # 이메일 전송 (HTML과 텍스트 둘 다 지원)
    email_message = EmailMultiAlternatives(
        subject=subject,
        body=text_message,
        to=[recipient_email],
        from_email=settings.EMAIL_HOST_USER
    )

    # HTML 버전 첨부
    email_message.attach_alternative(html_message, "text/html")

    # 이메일 헤더 설정 (MIME 타입 명시)
    email_message.mixed_subtype = 'related'

    try:
        email_message.send()
        logger.info(f'{log_prefix} 전송 성공: {recipient_email[:3]}***')
        return True
    except Exception as e:
        logger.error(f'{log_prefix} 전송 실패: {e}')
        return False


def _get_user_display_name(user) -> str:
    """사용자 표시 이름 반환"""
    return user.username if user.username else "고객"


def send_password_reset_email(request, user, reset_url):
    """
    비밀번호 재설정 이메일을 템플릿을 사용하여 전송합니다.
    """
    context = {
        'user_name': _get_user_display_name(user),
        'action_url': reset_url,
    }

    return _send_template_email(
        subject="[OpenNote] 비밀번호 재설정 요청",
        template_name="password_reset",
        context=context,
        recipient_email=user.email,
        log_prefix="비밀번호 재설정 이메일"
    )


def send_email_verification_email(request, user, verification_link):
    """
    이메일 인증 이메일을 템플릿을 사용하여 전송합니다.
    """
    context = {
        'user_name': _get_user_display_name(user),
        'action_url': verification_link,
    }

    return _send_template_email(
        subject="[OpenNote] 사용자 이메일 인증 요청",
        template_name="email_verification",
        context=context,
        recipient_email=user.email,
        log_prefix="이메일 인증 이메일"
    )


def send_social_verification_email(user, token):
    """
    소셜 로그인 인증 이메일을 전송합니다.
    """
    # 프론트엔드 URL 생성
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    verification_url = f"{frontend_url}/social-verification?token={token.token}"

    context = {
        'user_name': _get_user_display_name(user),
        'action_url': verification_url,
        'social_email': token.social_email,
        'provider': token.provider,
    }

    return _send_template_email(
        subject="[OpenNote] 소셜 계정 연결 인증 요청",
        template_name="social_verification",
        context=context,
        recipient_email=user.email,
        log_prefix="소셜 로그인 인증 이메일"
    )


def send_email_change_email(user, new_email: str, verify_url: str):
    """
    프로필 이메일 변경 확인 메일 전송
    """
    context = {
        'user_name': _get_user_display_name(user),
        'new_email': new_email,
        'action_url': verify_url,
    }

    return _send_template_email(
        subject="[OpenNote] 이메일 변경 확인",
        template_name="email_change",
        context=context,
        recipient_email=new_email,
        log_prefix="이메일 변경 확인 메일"
    )


def send_social_email_verification(linking_token, email: str):
    """
    소셜 로그인 시 이메일 인증 메일 전송

    Args:
        linking_token: AccountLinkingToken 인스턴스
        email: 인증할 이메일 주소
    """
    user = linking_token.user

    # 프론트엔드 URL 생성
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    verification_url = f"{frontend_url}/auth/social-email-verify?token={linking_token.email_verification_token}"

    # 프로바이더 이름 변환
    provider_names = {
        'google': 'Google',
        'github': 'GitHub',
        'naver': 'Naver',
        'kakao': 'Kakao',
    }
    provider_display = provider_names.get(linking_token.provider, linking_token.provider)

    context = {
        'user_name': _get_user_display_name(user),
        'action_url': verification_url,
        'email': email,
        'provider': provider_display,
    }

    return _send_template_email(
        subject="[OpenNote] 이메일 인증 요청",
        template_name="social_email_verification",
        context=context,
        recipient_email=email,
        log_prefix="소셜 이메일 인증 메일"
    )
