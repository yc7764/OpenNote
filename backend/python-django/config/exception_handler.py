# config/exception_handler.py
"""
DRF 커스텀 Exception Handler

모든 DRF 예외를 중앙에서 로깅합니다.
- 500 에러: 전체 traceback 포함 로깅
- 4xx 에러: WARNING 레벨로 로깅 (보안 관련만)
"""

import logging
from rest_framework.views import exception_handler

from apps.common.client_ip import get_client_ip

logger = logging.getLogger('django.request')


def custom_exception_handler(exc, context):
    """
    DRF 커스텀 예외 핸들러

    모든 예외를 로깅하고 표준 DRF 응답을 반환합니다.
    """
    # 표준 DRF 예외 처리 먼저 수행
    response = exception_handler(exc, context)

    # 요청 정보 추출
    request = context.get('request')
    view = context.get('view')
    view_name = view.__class__.__name__ if view else 'Unknown'

    # 사용자 정보
    user_id = None
    if request and hasattr(request, 'user') and request.user.is_authenticated:
        user_id = request.user.id

    # IP 주소 추출
    ip = get_client_ip(request) if request else None

    # 로깅 extra 데이터
    extra = {
        'event': 'exception',
        'view': view_name,
        'user_id': user_id,
        'ip': ip,
        'exception_type': exc.__class__.__name__,
    }

    if response is None:
        # Unhandled exception (500 에러)
        # DRF가 처리하지 못한 예외 - 전체 traceback 로깅
        logger.exception(
            f"Unhandled exception in {view_name}",
            extra={**extra, 'status_code': 500}
        )
    elif response.status_code >= 500:
        # Server error (5xx)
        logger.error(
            f"Server error in {view_name}: {exc}",
            extra={**extra, 'status_code': response.status_code},
            exc_info=True
        )
    elif response.status_code in (401, 403):
        # Authentication/Authorization errors - 보안 로그
        logger.warning(
            f"Auth error in {view_name}: {exc}",
            extra={**extra, 'status_code': response.status_code}
        )
    elif response.status_code == 429:
        # Rate limiting - 잠재적 남용 감지
        logger.warning(
            f"Rate limit exceeded in {view_name}",
            extra={**extra, 'status_code': 429}
        )
    # 400, 404 등 일반적인 클라이언트 에러는 로깅하지 않음 (노이즈 방지)

    return response
