"""
Views 패키지 - 모든 뷰를 re-export하여 역호환성 보장

기존 import 방식이 계속 작동합니다:
    from apps.accounts.views import CustomLoginView

Note: 소셜 로그인은 dj-rest-auth + allauth 기반으로 리팩토링되었습니다.
    python-social-auth 관련 뷰는 제거되었습니다.
"""

# Throttle 클래스 (앱 레벨로 이동됨)
from ..throttles import (
    SocialUnlinkThrottle,
    AccountMergeThrottle,
    SetPasswordThrottle,
)

# 인증 뷰
from .auth import (
    CustomLoginView,
    CustomLogoutView,
    CustomRegisterView,
    TokenRefreshView,
)

# 비밀번호 관련 뷰
from .password import (
    CustomPasswordResetView,
    PasswordResetConfirmRedirectView,
    PasswordResetTokenValidationView,
    CustomPasswordResetConfirmView,
    ChangePasswordView,
)

# 이메일 인증 뷰
from .email_verification import (
    verify_email,
    EmailVerificationStatusView,
    EmailVerificationTokenView,
    ResendVerificationEmailView,
)

# 이메일 변경 뷰
from .email_change import (
    EmailChangeRequestView,
    EmailChangeResendView,
    EmailChangeCancelView,
    EmailChangeStatusView,
    verify_email_change,
)

# 프로필 관련 뷰
from .profile import (
    UserProfileView,
    DeleteAccountView,
)

# dj-rest-auth 소셜 로그인 뷰 (python-social-auth 대체)
from .social import (
    GoogleLogin,
    GitHubLogin,
    NaverLogin,
    KakaoLogin,
    SocialConnectView,
    SocialConnectPrepareView,
    SocialDisconnectView,
)

# 소셜 계정 관리 뷰
from .social_management import (
    LinkedAccountsView,
    UnlinkSocialAccountView,
    SetPasswordView,
    MergeAccountsView,
)

# 쿼터 API
from .quota import (
    get_quota_info,
)

# format_bytes는 utils에서 re-export (하위 호환성 유지)
from ..utils.formatting import format_bytes


__all__ = [
    # Throttles
    'SocialUnlinkThrottle',
    'AccountMergeThrottle',
    'SetPasswordThrottle',
    # Auth
    'CustomLoginView',
    'CustomLogoutView',
    'CustomRegisterView',
    'TokenRefreshView',
    # Password
    'CustomPasswordResetView',
    'PasswordResetConfirmRedirectView',
    'PasswordResetTokenValidationView',
    'CustomPasswordResetConfirmView',
    'ChangePasswordView',
    # Email verification
    'verify_email',
    'EmailVerificationStatusView',
    'EmailVerificationTokenView',
    'ResendVerificationEmailView',
    # Email change
    'EmailChangeRequestView',
    'EmailChangeResendView',
    'EmailChangeCancelView',
    'EmailChangeStatusView',
    'verify_email_change',
    # Profile
    'UserProfileView',
    'DeleteAccountView',
    # dj-rest-auth 소셜 로그인
    'GoogleLogin',
    'GitHubLogin',
    'NaverLogin',
    'KakaoLogin',
    'SocialConnectView',
    'SocialConnectPrepareView',
    'SocialDisconnectView',
    # Social management
    'LinkedAccountsView',
    'UnlinkSocialAccountView',
    'SetPasswordView',
    'MergeAccountsView',
    # Quota
    'format_bytes',
    'get_quota_info',
]
