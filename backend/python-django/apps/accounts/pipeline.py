"""
소셜 로그인 파이프라인

Note: dj-rest-auth + allauth 기반으로 리팩토링되었습니다.
    python-social-auth 관련 파이프라인 함수는 제거되었습니다.
    소셜 로그인 처리는 allauth adapter (adapters.py)에서 담당합니다.

이 파일은 역호환성을 위해 services/ 패키지에서 함수를 re-export합니다.
새로운 코드에서는 services/ 패키지에서 직접 import하는 것을 권장합니다.
"""

# 모든 함수를 services 패키지에서 re-export
from .services import (
    # Helpers
    LINK_STATE_PREFIX,
    BACKEND_TO_PROVIDER,
    SUPPORTED_BACKENDS,
    safe_get_response_data,
    validate_social_data,
    generate_unique_username,
    split_name,
    get_provider_name,
    # Social linking
    link_social_account,
    create_social_verification_token,
    send_social_verification_email,
    unlink_social_account,
    set_password_for_social_user,
    merge_accounts,
)


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
