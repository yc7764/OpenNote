# apps/common/logging_utils.py
"""
비즈니스 로깅 유틸리티

일관된 형식의 비즈니스 이벤트 로깅을 위한 헬퍼 함수들.
JSON 포맷으로 Loki에 전송되어 쿼리 가능.
"""

import logging
from typing import Optional, Any

# 클라이언트 IP 판별은 client_ip 모듈이 정본이다.
# 기존 `from apps.common.logging_utils import get_client_ip` 경로 호환을 위해 재수출한다.
from apps.common.client_ip import get_client_ip  # noqa: F401


def mask_email(email: str) -> str:
    """
    이메일 마스킹 (개인정보 보호)

    예: user@example.com → u***@example.com
    """
    if not email or '@' not in email:
        return '***'
    local, domain = email.split('@', 1)
    if len(local) <= 1:
        return f"*@{domain}"
    return f"{local[0]}{'*' * (len(local) - 1)}@{domain}"


def get_user_agent(request) -> Optional[str]:
    """요청에서 User-Agent 헤더 추출"""
    if request is None:
        return None
    return request.META.get('HTTP_USER_AGENT', '')[:200]  # 길이 제한


def log_business_event(
    logger: logging.Logger,
    event: str,
    request=None,
    user=None,
    level: str = 'info',
    **kwargs: Any
) -> None:
    """
    비즈니스 이벤트 로깅

    Args:
        logger: 로거 인스턴스
        event: 이벤트 이름 (예: 'login_success', 'note_created')
        request: Django 요청 객체 (선택)
        user: 사용자 객체 (선택, request에서 추출 가능)
        level: 로그 레벨 ('info', 'warning', 'error')
        **kwargs: 추가 로그 데이터

    Example:
        log_business_event(
            logger, 'note_created',
            request=request,
            note_id=note.id,
            file_size=file.size
        )
    """
    # 사용자 정보 추출
    if user is None and request is not None:
        user = getattr(request, 'user', None)

    user_id = None
    if user is not None and hasattr(user, 'id'):
        if hasattr(user, 'is_authenticated') and user.is_authenticated:
            user_id = user.id
        elif not hasattr(user, 'is_authenticated'):
            # AnonymousUser가 아닌 경우
            user_id = user.id

    # 로그 데이터 구성
    extra = {
        'event': event,
        'user_id': user_id,
        'ip': get_client_ip(request),
        **kwargs
    }

    # 로그 레벨에 따라 기록
    log_func = getattr(logger, level, logger.info)
    log_func(event, extra=extra)


def log_auth_event(
    logger: logging.Logger,
    event: str,
    request,
    success: bool,
    user=None,
    email: str = None,
    **kwargs: Any
) -> None:
    """
    인증 관련 이벤트 로깅 (보안 로그)

    Args:
        logger: 로거 인스턴스
        event: 이벤트 이름 (예: 'login', 'logout', 'password_reset')
        request: Django 요청 객체
        success: 성공 여부
        user: 사용자 객체 (선택)
        email: 이메일 (마스킹하여 로깅)
        **kwargs: 추가 로그 데이터
    """
    level = 'info' if success else 'warning'

    extra_data = {
        'status': 'success' if success else 'failure',
        'user_agent': get_user_agent(request),
    }

    if email:
        extra_data['email_masked'] = mask_email(email)

    extra_data.update(kwargs)

    log_business_event(
        logger=logger,
        event=event,
        request=request,
        user=user,
        level=level,
        **extra_data
    )


def log_resource_event(
    logger: logging.Logger,
    event: str,
    request,
    resource_type: str,
    resource_id: Any,
    action: str = None,
    **kwargs: Any
) -> None:
    """
    리소스(노트, 태스크 등) 관련 이벤트 로깅

    Args:
        logger: 로거 인스턴스
        event: 이벤트 이름 (예: 'note_created', 'task_submitted')
        request: Django 요청 객체
        resource_type: 리소스 타입 ('note', 'task', 'inquiry')
        resource_id: 리소스 ID
        action: 액션 ('create', 'delete', 'update')
        **kwargs: 추가 로그 데이터
    """
    log_business_event(
        logger=logger,
        event=event,
        request=request,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action,
        **kwargs
    )
