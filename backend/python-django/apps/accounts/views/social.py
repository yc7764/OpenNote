"""
dj-rest-auth 기반 소셜 로그인 뷰

python-social-auth를 대체하는 표준 소셜 로그인 구현:
- 각 프로바이더별 SocialLoginView 제공
- 소셜 계정 연결/해제 기능
- allauth SocialAccount 모델 사용
- 이메일 필수화: 이메일 없으면 추가 입력 요청
"""
import os
import logging
import re
import secrets
import requests
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.github.views import GitHubOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView
from allauth.socialaccount.models import SocialAccount

from ..models import SocialAccountMetadata, AccountLinkingToken
from ..constants import (
    MERGE_TOKEN_COOKIE,
    CONNECT_STATE_COOKIE,
    SOCIAL_TEMP_TOKEN_COOKIE,
    SOCIAL_TEMP_TOKEN_MAX_AGE,
)
from ..services.helpers import get_github_primary_email
from ..utils import is_email_available
from apps.common.logging_utils import log_auth_event

User = get_user_model()
logger = logging.getLogger(__name__)

# Naver와 Kakao는 allauth에서 기본 제공하지 않을 수 있으므로 별도 처리
try:
    from allauth.socialaccount.providers.naver.views import NaverOAuth2Adapter
except ImportError:
    NaverOAuth2Adapter = None

try:
    from allauth.socialaccount.providers.kakao.views import KakaoOAuth2Adapter
except ImportError:
    KakaoOAuth2Adapter = None

# 프로바이더별 OAuth 설정 (로그인용)
PROVIDER_OAUTH_CONFIG = {
    'google': {
        'token_url': 'https://oauth2.googleapis.com/token',
        'userinfo_url': 'https://www.googleapis.com/oauth2/v2/userinfo',
        'client_id_key': 'SOCIAL_AUTH_GOOGLE_OAUTH2_KEY',
        'client_secret_key': 'SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET',
    },
    'github': {
        'token_url': 'https://github.com/login/oauth/access_token',
        'userinfo_url': 'https://api.github.com/user',
        'client_id_key': 'SOCIAL_AUTH_GITHUB_KEY',
        'client_secret_key': 'SOCIAL_AUTH_GITHUB_SECRET',
    },
    'naver': {
        'token_url': 'https://nid.naver.com/oauth2.0/token',
        'userinfo_url': 'https://openapi.naver.com/v1/nid/me',
        'client_id_key': 'SOCIAL_AUTH_NAVER_KEY',
        'client_secret_key': 'SOCIAL_AUTH_NAVER_SECRET',
    },
    'kakao': {
        'token_url': 'https://kauth.kakao.com/oauth/token',
        'userinfo_url': 'https://kapi.kakao.com/v2/user/me',
        'client_id_key': 'SOCIAL_AUTH_KAKAO_KEY',
        'client_secret_key': 'SOCIAL_AUTH_KAKAO_SECRET',
    },
}


class EmailRequiredMixin:
    """
    소셜 로그인 시 이메일 필수화를 위한 Mixin

    이메일이 없는 경우:
    1. GitHub: /user/emails API로 추가 조회 시도
    2. 여전히 없으면 email_required 응답 반환
    """
    authentication_classes = []
    provider_name = None  # 각 하위 클래스에서 설정

    def post(self, request, *args, **kwargs):
        # 원본 응답 가져오기
        response = super().post(request, *args, **kwargs)

        # 로그인 성공 (2xx 응답)인 경우에만 이메일 검증
        if response.status_code < 200 or response.status_code >= 300:
            return response

        # 사용자 확인
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            # serializer에서 user 정보 가져오기 시도
            if hasattr(self, 'user'):
                user = self.user

        if not user:
            return response

        # 이메일 확인
        if user.email:
            # 비즈니스 로깅: 소셜 로그인 성공
            log_auth_event(logger, 'social_login', request, success=True,
                          user=user, provider=self.provider_name)
            return response

        # 이메일이 없는 경우
        logger.warning(f"[{self.provider_name}Login] User {user.id} has no email")

        # GitHub인 경우 추가 API 호출 시도
        if self.provider_name == 'github':
            email = self._try_get_github_email(request)
            # 1차: 애플리케이션 레벨 중복 체크
            if email and is_email_available(email, exclude_user_id=user.id):
                try:
                    user.email = email
                    user.save(update_fields=['email'])
                    logger.info(f"[GitHubLogin] Set email from GitHub API for user {user.id}")
                    return response
                except IntegrityError:
                    # 2차: DB unique 제약 위반 (경합 조건) - 이메일 입력 요청으로 진행
                    logger.warning(f"[GitHubLogin] Email conflict for user {user.id}: {email[:3]}***")

        # 이메일을 얻지 못한 경우: email_required 응답
        return self._create_email_required_response(user, response)

    def _try_get_github_email(self, request):
        """GitHub API를 사용하여 이메일 조회 시도"""
        try:
            # sociallogin에서 access token 가져오기
            if hasattr(self, 'serializer') and hasattr(self.serializer, 'validated_data'):
                social_login = self.serializer.validated_data.get('social_login')
                if social_login and hasattr(social_login, 'token'):
                    access_token = social_login.token.token
                    return get_github_primary_email(access_token)
        except Exception as e:
            logger.error(f"[GitHubLogin] Failed to get email from GitHub API: {e}")
        return None

    def _create_email_required_response(self, user, original_response):
        """이메일 입력이 필요한 경우의 응답 생성"""
        # 임시 토큰 생성
        temp_token = AccountLinkingToken.objects.create(
            user=user,
            provider=self.provider_name,
            social_id=str(user.id),  # 임시로 user.id 사용
            link_type='set_password',  # 이메일 설정용으로 재활용
            expires_at=timezone.now() + timedelta(minutes=30)
        )

        # 임시 토큰은 HttpOnly 쿠키로만 전달한다(응답 바디·sessionStorage 노출 제거).
        # 이후 submit/resend/verify-status 호출에 브라우저가 자동으로 실어 보낸다.
        response = Response({
            'email_required': True,
            'provider': self.provider_name,
            'message': '이메일 주소를 입력해주세요. 계정 복구 및 알림에 사용됩니다.',
        }, status=status.HTTP_200_OK)
        response.set_cookie(
            SOCIAL_TEMP_TOKEN_COOKIE,
            str(temp_token.token),
            max_age=SOCIAL_TEMP_TOKEN_MAX_AGE,
            httponly=True,
            secure=not settings.DEBUG,
            samesite='Lax',
            path='/',
        )
        return response


class GoogleLogin(EmailRequiredMixin, SocialLoginView):
    """
    Google OAuth2 소셜 로그인

    POST /api/auth/social/google/
    Body: {"code": "oauth_authorization_code"}
    Response: {"access": "jwt_access_token", "refresh": "jwt_refresh_token", "user": {...}}

    Google은 이메일을 항상 제공하므로 email_required 응답이 발생하지 않음
    """
    provider_name = 'google'
    adapter_class = GoogleOAuth2Adapter
    callback_url = settings.SOCIALACCOUNT_PROVIDERS.get('google', {}).get('CALLBACK_URL',
                   f"{settings.FRONTEND_URL}/auth/callback/google")
    client_class = OAuth2Client


class GitHubLogin(EmailRequiredMixin, SocialLoginView):
    """
    GitHub OAuth2 소셜 로그인

    POST /api/auth/social/github/
    Body: {"code": "oauth_authorization_code"}
    Response: {"access": "jwt_access_token", "refresh": "jwt_refresh_token", "user": {...}}

    GitHub 사용자가 이메일을 비공개로 설정한 경우:
    1. /user/emails API로 primary email 조회 시도
    2. 실패 시 email_required 응답 반환
    """
    provider_name = 'github'
    adapter_class = GitHubOAuth2Adapter
    callback_url = settings.SOCIALACCOUNT_PROVIDERS.get('github', {}).get('CALLBACK_URL',
                   f"{settings.FRONTEND_URL}/auth/callback/github")
    client_class = OAuth2Client


class NaverLogin(EmailRequiredMixin, SocialLoginView):
    """
    Naver OAuth2 소셜 로그인

    POST /api/auth/social/naver/
    Body: {"code": "oauth_authorization_code", "state": "csrf_state"}
    Response: {"access": "jwt_access_token", "refresh": "jwt_refresh_token", "user": {...}}
    """
    provider_name = 'naver'
    adapter_class = NaverOAuth2Adapter
    callback_url = settings.SOCIALACCOUNT_PROVIDERS.get('naver', {}).get('CALLBACK_URL',
                   f"{settings.FRONTEND_URL}/auth/callback/naver")
    client_class = OAuth2Client


class KakaoLogin(EmailRequiredMixin, SocialLoginView):
    """
    Kakao OAuth2 소셜 로그인

    POST /api/auth/social/kakao/
    Body: {"code": "oauth_authorization_code"}
    Response: {"access": "jwt_access_token", "refresh": "jwt_refresh_token", "user": {...}}
    """
    provider_name = 'kakao'
    adapter_class = KakaoOAuth2Adapter
    callback_url = settings.SOCIALACCOUNT_PROVIDERS.get('kakao', {}).get('CALLBACK_URL',
                   f"{settings.FRONTEND_URL}/auth/callback/kakao")
    client_class = OAuth2Client


class SocialConnectPrepareView(APIView):
    """
    소셜 연동 CSRF 방어용 서버 발급 state 준비.

    GET /api/auth/social/{provider}/connect/prepare/
    연동을 시작하기 직전 프론트가 호출한다. 서버가 랜덤 state를 만들어
    HttpOnly 쿠키(connect_state)로 심고 값도 응답 바디로 돌려준다.
    프론트는 이 state를 OAuth authorize URL에 싣고, 콜백에서 connect POST에
    함께 보낸다. 서버는 POST 시 쿠키와 바디의 state를 대조해 CSRF를 차단한다.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, provider):
        state = secrets.token_urlsafe(32)
        response = Response({'state': state}, status=status.HTTP_200_OK)
        response.set_cookie(
            CONNECT_STATE_COOKIE,
            state,
            max_age=600,  # 10분 — OAuth 왕복에 충분
            httponly=True,
            secure=not settings.DEBUG,
            samesite='Lax',
            path='/',
        )
        return response


class SocialConnectView(APIView):
    """
    소셜 계정 연결 (이미 로그인된 사용자가 새 소셜 계정 추가)

    POST /api/auth/social/{provider}/connect/
    Body: {"code": "oauth_authorization_code", "state": "server_issued_state"}

    기존 사용자에게 새 소셜 계정을 연결합니다.
    다른 사용자에게 이미 연결된 소셜 계정인 경우 병합 토큰을 반환합니다.
    """
    permission_classes = [IsAuthenticated]

    # OAuth 코드 검증 상수
    OAUTH_CODE_MAX_LENGTH = 2048
    OAUTH_CODE_PATTERN = re.compile(r'^[a-zA-Z0-9_\-./]+$')

    def post(self, request, provider):
        # 서버 발급 state(쿠키) ↔ 요청 바디 state 대조로 연동 CSRF 차단.
        # 브라우저 설정(SameSite=Lax) 한 겹에만 의존하던 방어를 서버 측으로 이중화한다.
        cookie_state = request.COOKIES.get(CONNECT_STATE_COOKIE, '')
        body_state = request.data.get('state', '')
        state_ok = bool(cookie_state) and secrets.compare_digest(str(cookie_state), str(body_state))
        if not state_ok:
            resp = Response(
                {'detail': '보안 검증에 실패했습니다. 연동을 다시 시도해주세요.'},
                status=status.HTTP_403_FORBIDDEN,
            )
            resp.delete_cookie(CONNECT_STATE_COOKIE, path='/')
            return resp

        code = request.data.get('code', '')

        # 널/빈값 체크
        if not code:
            return Response(
                {'detail': 'OAuth 인증 코드가 필요합니다'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 타입 체크
        if not isinstance(code, str):
            return Response(
                {'detail': '잘못된 코드 형식입니다'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 길이 검증
        if len(code) > self.OAUTH_CODE_MAX_LENGTH:
            logger.warning(f"[SocialConnect] 과대 OAuth 코드 수신: {len(code)} 문자")
            return Response(
                {'detail': '잘못된 인증 코드입니다'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 패턴 검증
        if not self.OAUTH_CODE_PATTERN.match(code):
            logger.warning(f"[SocialConnect] 잘못된 OAuth 코드 패턴")
            return Response(
                {'detail': '잘못된 인증 코드 형식입니다'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 프로바이더 확인
        provider_id = self._normalize_provider(provider)
        if not provider_id:
            return Response(
                {'detail': f'Unknown provider: {provider}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 이미 연결된 계정인지 확인
        existing = SocialAccount.objects.filter(
            user=request.user,
            provider=provider_id
        ).first()

        if existing:
            return Response(
                {'detail': f'{provider} 계정이 이미 연결되어 있습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # OAuth 설정 확인
        if provider_id not in PROVIDER_OAUTH_CONFIG:
            return Response(
                {'detail': f'Provider {provider} is not configured'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        try:
            # 1. OAuth code를 사용하여 액세스 토큰 교환
            access_token = self._exchange_code_for_token(provider_id, code)
            if not access_token:
                return Response(
                    {'detail': '소셜 인증 토큰 교환에 실패했습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 2. 액세스 토큰으로 소셜 사용자 정보 조회
            social_info = self._get_social_user_info(provider_id, access_token)
            if not social_info or not social_info.get('id'):
                return Response(
                    {'detail': '소셜 계정 정보를 가져오는데 실패했습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            social_id = str(social_info.get('id'))
            social_email = social_info.get('email', '')
            social_name = social_info.get('name', '')

            logger.info(f"[SocialConnect] User {request.user.id} connecting {provider_id}, social_id={social_id}")

            # 3. 해당 소셜 계정이 다른 사용자에게 이미 연결되어 있는지 확인
            existing_social = SocialAccount.objects.filter(
                provider=provider_id,
                uid=social_id
            ).first()

            if existing_social:
                if existing_social.user_id == request.user.id:
                    # 이미 본인에게 연결됨
                    return Response(
                        {'message': f'{provider} 계정이 이미 연결되어 있습니다.'},
                        status=status.HTTP_200_OK
                    )
                else:
                    # 다른 사용자에게 연결됨 - 병합 토큰 생성
                    other_user = existing_social.user
                    logger.info(f"[SocialConnect] Social account linked to different user {other_user.id}, merge required")

                    # 기존 pending 병합 토큰 만료 처리
                    AccountLinkingToken.objects.filter(
                        user=request.user,
                        provider=provider_id,
                        link_type='merge_accounts',
                        status='pending'
                    ).update(status='expired')

                    # 병합 토큰 생성
                    merge_token = AccountLinkingToken.objects.create(
                        user=request.user,
                        provider=provider_id,
                        social_id=social_id,
                        social_email=social_email,
                        social_name=social_name,
                        link_type='merge_accounts',
                        source_user=other_user,
                        expires_at=timezone.now() + timedelta(minutes=30)
                    )

                    # 병합 토큰을 응답 바디(프론트가 URL 쿼리에 실었음) 대신
                    # HttpOnly 쿠키로 전달해 URL 노출을 제거한다.
                    merge_response = Response({
                        'merge_required': True,
                        'provider': provider_id,
                        'other_email': other_user.email,
                        'message': '이 소셜 계정은 다른 계정에 연결되어 있습니다. 계정을 병합하시겠습니까?'
                    }, status=status.HTTP_200_OK)
                    merge_response.set_cookie(
                        MERGE_TOKEN_COOKIE,
                        str(merge_token.token),
                        max_age=1800,  # 30분 — 토큰 만료와 일치
                        httponly=True,
                        secure=not settings.DEBUG,
                        samesite='Lax',
                        path='/',
                    )
                    # state 쿠키 소비(단일 사용)
                    merge_response.delete_cookie(CONNECT_STATE_COOKIE, path='/')
                    return merge_response

            # 4. 새 소셜 계정 연결 (allauth SocialAccount 생성)
            social_account = SocialAccount.objects.create(
                user=request.user,
                provider=provider_id,
                uid=social_id,
                extra_data={
                    'email': social_email,
                    'name': social_name,
                }
            )

            # 메타데이터 생성
            SocialAccountMetadata.objects.create(
                social_account=social_account,
                linked_by='manual',
                access_count=1,
                last_used_at=timezone.now()
            )

            # 사용자 is_social_user 플래그 업데이트
            if not request.user.is_social_user:
                request.user.is_social_user = True
                request.user.save(update_fields=['is_social_user'])

            logger.info(f"[SocialConnect] Social account connected successfully: user={request.user.id}, provider={provider_id}")

            # 비즈니스 로깅: 소셜 계정 연결
            log_auth_event(logger, 'social_account_connected', request, success=True,
                          user=request.user, provider=provider_id)

            success_response = Response(
                {'message': f'{provider} 계정이 성공적으로 연결되었습니다.'},
                status=status.HTTP_200_OK
            )
            # state 쿠키 소비(단일 사용)
            success_response.delete_cookie(CONNECT_STATE_COOKIE, path='/')
            return success_response

        except requests.RequestException as e:
            logger.error(f"[SocialConnect] Request error: {str(e)}")
            return Response(
                {'detail': '소셜 서비스 연결 중 오류가 발생했습니다.'},
                status=status.HTTP_502_BAD_GATEWAY
            )
        except Exception as e:
            logger.error(f"[SocialConnect] Unexpected error: {str(e)}", exc_info=True)
            return Response(
                {'detail': '소셜 계정 연결 중 오류가 발생했습니다.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _normalize_provider(self, provider):
        """프로바이더 이름 정규화"""
        provider_map = {
            'google': 'google',
            'google-oauth2': 'google',
            'github': 'github',
            'naver': 'naver',
            'kakao': 'kakao',
        }
        return provider_map.get(provider.lower())

    def _get_oauth_credentials(self, provider_id, for_connect=True):
        """프로바이더별 OAuth credentials 가져오기

        Args:
            provider_id: 프로바이더 ID
            for_connect: True면 계정 연결용 키 사용 (GitHub의 경우 별도 OAuth App)
        """
        config = PROVIDER_OAUTH_CONFIG.get(provider_id)
        if not config:
            return None, None

        # GitHub 계정 연결 시 별도 OAuth App 사용 (콜백 URL이 다르므로)
        if provider_id == 'github' and for_connect:
            client_id = os.environ.get('SOCIAL_AUTH_GITHUB_CONNECT_KEY', '')
            client_secret = os.environ.get('SOCIAL_AUTH_GITHUB_CONNECT_SECRET', '')
        else:
            client_id = os.environ.get(config['client_id_key'], '')
            client_secret = os.environ.get(config['client_secret_key'], '')

        return client_id, client_secret

    def _get_redirect_uri(self, provider_id):
        """프론트엔드 콜백 URL 생성"""
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        return f"{frontend_url}/auth/connect/callback/{provider_id}"

    def _exchange_code_for_token(self, provider_id, code):
        """OAuth 인증 코드를 액세스 토큰으로 교환"""
        config = PROVIDER_OAUTH_CONFIG.get(provider_id)
        if not config:
            return None

        client_id, client_secret = self._get_oauth_credentials(provider_id)
        if not client_id or not client_secret:
            logger.error(f"[SocialConnect] Missing OAuth credentials for {provider_id}")
            return None

        redirect_uri = self._get_redirect_uri(provider_id)

        data = {
            'grant_type': 'authorization_code',
            'client_id': client_id,
            'client_secret': client_secret,
            'code': code,
            'redirect_uri': redirect_uri,
        }

        headers = {'Accept': 'application/json'}

        try:
            response = requests.post(config['token_url'], data=data, headers=headers, timeout=10)
            response.raise_for_status()

            token_data = response.json()
            return token_data.get('access_token')
        except requests.RequestException as e:
            logger.error(f"[SocialConnect] Token exchange failed for {provider_id}: {str(e)}")
            return None

    def _get_social_user_info(self, provider_id, access_token):
        """소셜 계정 사용자 정보 조회"""
        config = PROVIDER_OAUTH_CONFIG.get(provider_id)
        if not config:
            return None

        headers = {'Authorization': f'Bearer {access_token}'}

        try:
            response = requests.get(config['userinfo_url'], headers=headers, timeout=10)
            response.raise_for_status()

            data = response.json()

            # 프로바이더별 데이터 정규화
            if provider_id == 'kakao':
                kakao_account = data.get('kakao_account', {})
                profile = kakao_account.get('profile', {})
                return {
                    'id': str(data.get('id')),
                    'email': kakao_account.get('email'),
                    'name': profile.get('nickname'),
                }
            elif provider_id == 'google':
                return {
                    'id': data.get('id'),
                    'email': data.get('email'),
                    'name': data.get('name'),
                }
            elif provider_id == 'github':
                return {
                    'id': str(data.get('id')),
                    'email': data.get('email'),
                    'name': data.get('name') or data.get('login'),
                }
            elif provider_id == 'naver':
                response_data = data.get('response', {})
                return {
                    'id': response_data.get('id'),
                    'email': response_data.get('email'),
                    'name': response_data.get('name') or response_data.get('nickname'),
                }

            return data
        except requests.RequestException as e:
            logger.error(f"[SocialConnect] User info fetch failed for {provider_id}: {str(e)}")
            return None


class SocialDisconnectView(APIView):
    """
    소셜 계정 연결 해제

    POST /api/auth/social/{provider}/disconnect/

    연결된 소셜 계정을 해제합니다.
    최소 하나의 로그인 방법(비밀번호 또는 다른 소셜 계정)이 남아있어야 합니다.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, provider):
        from allauth.socialaccount.models import SocialAccount

        # 프로바이더 이름 정규화
        provider_id = self._normalize_provider(provider)
        if not provider_id:
            return Response(
                {'detail': f'Unknown provider: {provider}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 연결된 소셜 계정 찾기
        try:
            social_account = SocialAccount.objects.get(
                user=request.user,
                provider=provider_id
            )
        except SocialAccount.DoesNotExist:
            return Response(
                {'detail': f'{provider} 계정이 연결되어 있지 않습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 다른 로그인 방법이 있는지 확인
        has_password = request.user.has_usable_password()
        other_socials = SocialAccount.objects.filter(
            user=request.user
        ).exclude(provider=provider_id).exists()

        if not has_password and not other_socials:
            return Response(
                {'detail': '최소 하나의 로그인 방법이 필요합니다. 비밀번호를 설정하거나 다른 소셜 계정을 연결한 후 해제해주세요.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 소셜 계정 삭제
        social_account.delete()

        # 비즈니스 로깅: 소셜 계정 연결 해제
        log_auth_event(logger, 'social_account_disconnected', request, success=True,
                      user=request.user, provider=provider_id)

        return Response(
            {'message': f'{provider} 계정 연결이 해제되었습니다.'},
            status=status.HTTP_200_OK
        )

    def _normalize_provider(self, provider):
        """프로바이더 이름 정규화"""
        provider_map = {
            'google': 'google',
            'google-oauth2': 'google',
            'github': 'github',
            'naver': 'naver',
            'kakao': 'kakao',
        }
        return provider_map.get(provider.lower())
