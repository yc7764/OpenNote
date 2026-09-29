"""
Frontend URL 유틸리티 함수들

중복되는 os.environ.get('FRONTEND_URL', ...) 패턴을 통합
"""
import os
from urllib.parse import urlencode
from django.conf import settings


def get_frontend_url() -> str:
    """
    Frontend URL을 settings 또는 환경변수에서 가져옵니다.

    Returns:
        Frontend base URL (e.g., 'http://localhost:3000')
    """
    # settings에 정의되어 있으면 우선 사용
    if hasattr(settings, 'FRONTEND_URL'):
        return settings.FRONTEND_URL

    # 환경변수에서 조회 (NEXT_PUBLIC_FRONTEND_URL 또는 FRONTEND_URL)
    return os.environ.get(
        'FRONTEND_URL',
        os.environ.get('NEXT_PUBLIC_FRONTEND_URL', 'http://localhost:3000')
    )


def build_frontend_url(path: str, **query_params) -> str:
    """
    Frontend redirect URL을 생성합니다.

    Args:
        path: URL 경로 (e.g., '/profile', '/dashboard')
        **query_params: URL 쿼리 파라미터

    Returns:
        완성된 URL 문자열 (e.g., 'http://localhost:3000/profile?success=true')

    Example:
        >>> build_frontend_url('/profile', linked='github', success='true')
        'http://localhost:3000/profile?linked=github&success=true'
    """
    base_url = get_frontend_url()

    # path가 /로 시작하지 않으면 추가
    if not path.startswith('/'):
        path = '/' + path

    url = f"{base_url}{path}"

    if query_params:
        # None 값 필터링
        params = {k: v for k, v in query_params.items() if v is not None}
        if params:
            url = f"{url}?{urlencode(params)}"

    return url
