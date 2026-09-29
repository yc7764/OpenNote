"""
Services 패키지 - 비즈니스 로직을 모듈화

Note: dj-rest-auth + allauth 기반으로 리팩토링되었습니다.
    python-social-auth 관련 파이프라인 함수는 제거되었습니다.
    소셜 로그인 처리는 allauth adapter (adapters.py)에서 담당합니다.
"""

# 헬퍼 함수 및 상수
from .helpers import (
    LINK_STATE_PREFIX,
    BACKEND_TO_PROVIDER,
    SUPPORTED_BACKENDS,
    safe_get_response_data,
    validate_social_data,
    generate_unique_username,
    split_name,
    get_provider_name,
)

# 소셜 계정 연결/해제 함수
from .social_linking import (
    link_social_account,
    create_social_verification_token,
    unlink_social_account,
    set_password_for_social_user,
    merge_accounts,
)

# 이메일 유틸리티 (utils에서 re-export)
from ..utils.email import send_social_verification_email



__all__ = [
    # Helpers
    'LINK_STATE_PREFIX',
    'BACKEND_TO_PROVIDER',
    'SUPPORTED_BACKENDS',
    'safe_get_response_data',
    'validate_social_data',
    'generate_unique_username',
    'split_name',
    'get_provider_name',
    # Social linking
    'link_social_account',
    'create_social_verification_token',
    'send_social_verification_email',
    'unlink_social_account',
    'set_password_for_social_user',
    'merge_accounts',
]
