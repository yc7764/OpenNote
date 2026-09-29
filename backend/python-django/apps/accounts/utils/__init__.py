"""
Utils 패키지 - 유틸리티 함수들을 모듈화

기존 import 방식이 계속 작동합니다:
    from apps.accounts.utils import get_client_ip
"""

# Rate limiting 관련
from .rate_limiting import (
    get_client_ip,
    AttemptLimiter,
    login_limiter,
    password_reset_limiter,
    registration_limiter,
    email_verification_resend_limiter,
    email_change_request_limiter,
    email_change_resend_limiter,
    favorite_toggle_limiter,
    trash_action_limiter,
    check_login_attempts,
    record_failed_login,
    clear_login_attempts,
    check_password_reset_attempts,
    record_failed_password_reset,
    clear_password_reset_attempts,
    check_registration_attempts,
    record_failed_registration,
    clear_registration_attempts,
    check_email_verification_resend_attempts,
    record_failed_email_verification_resend,
    clear_email_verification_resend_attempts,
    check_email_verify_status_attempts,
    record_email_verify_status_attempt,
    get_remaining_login_attempts,
    check_email_change_request_attempts,
    record_failed_email_change_request,
    clear_email_change_request_attempts,
    check_email_change_resend_attempts,
    record_failed_email_change_resend,
    clear_email_change_resend_attempts,
    check_favorite_toggle_attempts,
    record_favorite_toggle_attempt,
    check_trash_action_attempts,
    record_trash_action_attempt,
    # 소셜 이메일 인증 rate limiting
    social_email_submit_limiter,
    social_email_verify_limiter,
    social_email_resend_limiter,
    social_email_status_limiter,
    check_social_email_submit_attempts,
    record_social_email_submit_attempt,
    check_social_email_verify_attempts,
    record_social_email_verify_attempt,
    check_social_email_resend_attempts,
    record_social_email_resend_attempt,
    check_social_email_status_attempts,
    record_social_email_status_attempt,
    get_remaining_attempts,
    get_lockout_time_remaining,
    get_lockout_minutes,
)

# Token 관련
from .tokens import (
    create_email_verification_token,
    create_email_verification_request_token,
    verify_email_verification_token,
    get_user_from_verification_token,
)

# Email 관련 (email_utils.py에서 이동됨)
from .email import (
    send_password_reset_email,
    send_email_verification_email,
    send_social_verification_email,
    send_email_change_email,
)

# Frontend URL 관련
from .frontend import (
    get_frontend_url,
    build_frontend_url,
)

# User lookup 관련
from .user_lookup import (
    get_user_by_email,
    get_user_by_username,
    get_user_by_email_or_username,
    user_exists_by_email,
    user_exists_by_username,
    get_user_by_id,
    is_email_available,
)

# Formatting 관련
from .formatting import (
    format_bytes,
    format_bytes_to_mb,
    format_bytes_to_gb,
)

# JWT Cookie 관련
from .jwt_cookies import (
    get_jwt_cookie_settings,
    set_jwt_cookies,
    clear_jwt_cookies,
    set_jwt_cookies_for_user,
)

# Validation 관련
from .validation import (
    validate_uuid,
    validate_uuid_or_error,
)


__all__ = [
    # Rate limiting
    'get_client_ip',
    'AttemptLimiter',
    'login_limiter',
    'password_reset_limiter',
    'registration_limiter',
    'email_verification_resend_limiter',
    'email_change_request_limiter',
    'email_change_resend_limiter',
    'favorite_toggle_limiter',
    'trash_action_limiter',
    'check_login_attempts',
    'record_failed_login',
    'clear_login_attempts',
    'check_password_reset_attempts',
    'record_failed_password_reset',
    'clear_password_reset_attempts',
    'check_registration_attempts',
    'record_failed_registration',
    'clear_registration_attempts',
    'check_email_verification_resend_attempts',
    'record_failed_email_verification_resend',
    'clear_email_verification_resend_attempts',
    'check_email_verify_status_attempts',
    'record_email_verify_status_attempt',
    'get_remaining_login_attempts',
    'check_email_change_request_attempts',
    'record_failed_email_change_request',
    'clear_email_change_request_attempts',
    'check_email_change_resend_attempts',
    'record_failed_email_change_resend',
    'clear_email_change_resend_attempts',
    'check_favorite_toggle_attempts',
    'record_favorite_toggle_attempt',
    'check_trash_action_attempts',
    'record_trash_action_attempt',
    'get_remaining_attempts',
    'get_lockout_time_remaining',
    'get_lockout_minutes',
    # Tokens
    'create_email_verification_token',
    'create_email_verification_request_token',
    'verify_email_verification_token',
    'get_user_from_verification_token',
    # Email
    'send_password_reset_email',
    'send_email_verification_email',
    'send_social_verification_email',
    'send_email_change_email',
    # Frontend
    'get_frontend_url',
    'build_frontend_url',
    # User lookup
    'get_user_by_email',
    'get_user_by_username',
    'get_user_by_email_or_username',
    'user_exists_by_email',
    'user_exists_by_username',
    'get_user_by_id',
    'is_email_available',
    # Formatting
    'format_bytes',
    'format_bytes_to_mb',
    'format_bytes_to_gb',
    # JWT Cookies
    'get_jwt_cookie_settings',
    'set_jwt_cookies',
    'clear_jwt_cookies',
    'set_jwt_cookies_for_user',
    # Validation
    'validate_uuid',
    'validate_uuid_or_error',
]
