"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.common.metrics import metrics_view
from apps.accounts.views import (
    CustomLoginView, CustomLogoutView, CustomPasswordResetView, CustomPasswordResetConfirmView, PasswordResetConfirmRedirectView,
    PasswordResetTokenValidationView, verify_email, EmailVerificationStatusView, EmailVerificationTokenView, ResendVerificationEmailView, CustomRegisterView,
    UserProfileView, ChangePasswordView, DeleteAccountView,
    # 이메일 변경
    EmailChangeRequestView, EmailChangeResendView, EmailChangeCancelView, EmailChangeStatusView, verify_email_change,
    # 쿼터 조회
    get_quota_info,
    # 소셜 계정 연결/관리 (Master Account)
    LinkedAccountsView, UnlinkSocialAccountView,
    SetPasswordView, MergeAccountsView,
    # JWT 토큰 갱신
    TokenRefreshView,
)
# dj-rest-auth 소셜 로그인 뷰
from apps.accounts.views.social import (
    GoogleLogin, GitHubLogin, NaverLogin, KakaoLogin,
    SocialConnectView, SocialConnectPrepareView, SocialDisconnectView,
)
# 소셜 로그인 추가 뷰
from apps.accounts.views.social_auth import (
    SocialEmailSubmitView,
    SocialEmailVerifyView,
    SocialEmailResendView,
    SocialEmailVerifyStatusView,
)

urlpatterns = [
    # Prometheus metrics endpoint
    # django_prometheus.urls를 그대로 include하면 무인증 공개가 된다.
    # IP 화이트리스트를 거치도록 같은 경로·같은 URL name으로 감싼 뷰를 쓴다.
    path('metrics', metrics_view, name='prometheus-django-metrics'),

    path('admin/', admin.site.urls),
    # 커스텀 로그인/로그아웃 뷰 (브루트 포스 공격 방지 적용) - 기본 URL 오버라이드
    path('api/auth/login/', CustomLoginView.as_view(), name='rest_login'),
    path('api/auth/logout/', CustomLogoutView.as_view(), name='rest_logout'),
    # JWT 토큰 갱신 (HttpOnly 쿠키 기반)
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # 커스텀 비밀번호 재설정 뷰 (브루트 포스 공격 방지 적용) - 기본 URL 오버라이드 (dj_rest_auth.urls보다 먼저 배치)
    path('api/auth/password/reset/', CustomPasswordResetView.as_view(), name='rest_password_reset'),
    path('api/auth/password/reset/validate/', PasswordResetTokenValidationView.as_view(), name='password_reset_validate'),
    path('api/auth/password/reset/confirm/', CustomPasswordResetConfirmView.as_view(), name='rest_password_reset_confirm'),
    # 커스텀 회원가입 뷰 (dj-rest-auth 복잡한 플로우 우회)
    path('api/auth/registration/', CustomRegisterView.as_view(), name='rest_register'),
    # 이메일 인증 관련 URLs
    path('api/auth/email/verify-status/', EmailVerificationStatusView.as_view(), name='email_verify_status'),
    path('api/auth/email/verify-token/', EmailVerificationTokenView.as_view(), name='email_verify_token'),
    path('api/auth/email/resend/', ResendVerificationEmailView.as_view(), name='email_resend'),
    # 이메일 변경 관련 URLs
    path('api/auth/email/change/request/', EmailChangeRequestView.as_view(), name='email_change_request'),
    path('api/auth/email/change/resend/', EmailChangeResendView.as_view(), name='email_change_resend'),
    path('api/auth/email/change/cancel/', EmailChangeCancelView.as_view(), name='email_change_cancel'),
    path('api/auth/email/change/status/', EmailChangeStatusView.as_view(), name='email_change_status'),
    path('verify-email-change/<uuid:token>/', verify_email_change, name='verify_email_change'),
    # path('api/auth/registration/', include('dj_rest_auth.registration.urls')),  # 커스텀 회원가입 뷰 사용
    # allauth.urls는 포함하지 않는다. OAuth 콜백은 프론트엔드(FRONTEND_URL/auth/callback/<provider>)로
    # 가고 토큰 교환은 커스텀 /api/auth/social/<provider>/ 뷰가 처리하므로 /accounts/* 경로가 불필요하다.
    # 포함하면 allauth 기본 signup/login/password-reset 폼이 노출돼, 커스텀 이메일 인증·가입 rate limit·
    # 브루트포스 방어를 우회하는 로컬 가입 경로(is_active=True 즉시 발급)가 생긴다.
    # 프론트엔드 리다이렉트용 URL 패턴 (password_reset_confirm 패턴 제공) - 이메일 링크용
    path('password-reset-confirm/<uidb64>/<token>/', PasswordResetConfirmRedirectView.as_view(), name='password_reset_confirm'),
    # 이메일 인증 링크 처리
    path('verify-email/<uuid:token>/', verify_email, name='verify-email'),

    # ============================================
    # dj-rest-auth 소셜 로그인 URLs (python-social-auth 대체)
    # ============================================
    # 소셜 로그인 (프론트엔드에서 OAuth code를 받아 JWT 토큰 교환)
    path('api/auth/social/google/', GoogleLogin.as_view(), name='google_login'),
    path('api/auth/social/github/', GitHubLogin.as_view(), name='github_login'),
    path('api/auth/social/naver/', NaverLogin.as_view(), name='naver_login'),
    path('api/auth/social/kakao/', KakaoLogin.as_view(), name='kakao_login'),

    # 소셜 계정 연결/해제 (로그인된 사용자)
    path('api/auth/social/<str:provider>/connect/prepare/', SocialConnectPrepareView.as_view(), name='social_connect_prepare'),
    path('api/auth/social/<str:provider>/connect/', SocialConnectView.as_view(), name='social_connect'),
    path('api/auth/social/<str:provider>/disconnect/', SocialDisconnectView.as_view(), name='social_disconnect'),

    # 소셜 로그인 이메일 입력 및 인증 (이메일 없이 로그인한 사용자)
    path('api/auth/social/submit-email/', SocialEmailSubmitView.as_view(), name='social_submit_email'),
    path('api/auth/social/verify-email/', SocialEmailVerifyView.as_view(), name='social_verify_email'),
    path('api/auth/social/resend-email/', SocialEmailResendView.as_view(), name='social_resend_email'),
    path('api/auth/social/verify-status/', SocialEmailVerifyStatusView.as_view(), name='social_verify_status'),

    # 사용자 프로필 관련 URLs
    path('api/auth/profile/', UserProfileView.as_view(), name='user_profile'),
    path('api/auth/change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('api/auth/delete-account/', DeleteAccountView.as_view(), name='delete_account'),

    # 소셜 계정 관리 URLs
    path('api/auth/profile/linked-accounts/', LinkedAccountsView.as_view(), name='linked_accounts'),
    path('api/auth/social/unlink/<str:provider>/', UnlinkSocialAccountView.as_view(), name='unlink_social_account'),
    path('api/auth/password/set/', SetPasswordView.as_view(), name='set_password'),
    path('api/auth/accounts/merge/', MergeAccountsView.as_view(), name='merge_accounts'),

    # 쿼터 관련 URLs
    path('api/accounts/quota/', get_quota_info, name='quota_info'),

    # 노트 관련 URLs
    path('', include('apps.notes.urls')),

    # 고객 지원 관련 URLs (FAQ, 문의)
    path('api/support/', include('apps.support.urls')),

    # 알림 관련 URLs
    path('api/notifications/', include('apps.notifications.urls')),
]

# 개발 환경에서 미디어 파일 서빙
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
