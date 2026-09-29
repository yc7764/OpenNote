"""
인증 관련 뷰 (로그인, 로그아웃, 회원가입)
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils.translation import gettext_lazy as _
from django.contrib.auth import get_user_model

from ..utils import (
    get_client_ip, check_login_attempts, record_failed_login,
    clear_login_attempts, get_remaining_attempts, get_remaining_login_attempts, get_lockout_minutes,
    check_registration_attempts, record_failed_registration,
    create_email_verification_request_token,
    set_jwt_cookies,
    clear_jwt_cookies,
)
from apps.common.logging_utils import log_auth_event

logger = logging.getLogger(__name__)
User = get_user_model()


class CustomLoginView(APIView):
    """
    브루트 포스 공격 방지가 적용된 커스텀 로그인 뷰
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        from django.contrib.auth import authenticate
        from django.contrib.auth import login as django_login

        # login 또는 username 필드 모두 처리
        login_identifier = request.data.get('login', '') or request.data.get('username', '')
        password = request.data.get('password', '')
        client_ip = get_client_ip(request)

        # 브루트 포스 공격 방지 - 로그인 시도 횟수 체크
        if login_identifier:
            lockout_message = check_login_attempts(login_identifier, client_ip)
            if lockout_message:
                return Response(
                    {'detail': lockout_message},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )

        # 먼저 사용자 존재 여부 확인
        user_obj = None
        if '@' in login_identifier:
            # 이메일로 로그인 시도
            try:
                user_obj = User.objects.get(email=login_identifier)
            except User.DoesNotExist:
                pass
        else:
            # 사용자명으로 로그인 시도
            try:
                user_obj = User.objects.get(username=login_identifier)
            except User.DoesNotExist:
                pass

        # 사용자가 존재하지 않는 경우
        if user_obj is None:
            # 로그인 실패 기록
            user_attempts, ip_attempts = record_failed_login(login_identifier, client_ip)
            remaining_attempts = get_remaining_login_attempts(login_identifier, client_ip)
            lockout_minutes = get_lockout_minutes('login')

            # 비즈니스 로깅: 로그인 실패 (사용자 없음)
            log_auth_event(logger, 'login', request, success=False,
                          email=login_identifier if '@' in login_identifier else None,
                          reason='user_not_found', remaining_attempts=remaining_attempts)

            if remaining_attempts > 0:
                error_msg = _('아이디 또는 비밀번호가 올바르지 않습니다.\n남은 시도 횟수: {}회').format(remaining_attempts)
            else:
                error_msg = _('로그인 시도 횟수를 초과했습니다.\n{}분 후 다시 시도해주세요.').format(lockout_minutes)

            return Response(
                {'detail': error_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 사용자가 존재하지만 이메일 인증이 안된 경우
        if not user_obj.is_active:
            # 비밀번호 검증을 통과한 경우에만 인증 안내·토큰을 발급한다.
            # 검증 없이 발급하면 username만으로 계정 존재 여부·이메일·서명된
            # 토큰이 노출된다. 비활성 계정은 authenticate()가 거부하므로
            # check_password로 직접 검증한다.
            if not user_obj.check_password(password):
                # L2: 실패 카운트는 비밀번호가 틀린 경우에만 적립한다. 과거엔 is_active
                # 분기 진입 즉시 적립해, 올바른 비번으로 인증 안내를 받는 정상 미인증
                # 사용자도 실패로 집계돼 반복 시 자기 락아웃되던 문제가 있었다.
                record_failed_login(login_identifier, client_ip)
                remaining_attempts = get_remaining_login_attempts(login_identifier, client_ip)
                lockout_minutes = get_lockout_minutes('login')

                # 비즈니스 로깅: 로그인 실패 (비밀번호 오류)
                log_auth_event(logger, 'login', request, success=False,
                              user=user_obj, reason='invalid_password',
                              remaining_attempts=remaining_attempts)

                if remaining_attempts > 0:
                    error_msg = _('아이디 또는 비밀번호가 올바르지 않습니다.\n남은 시도 횟수: {}회').format(remaining_attempts)
                else:
                    error_msg = _('로그인 시도 횟수를 초과했습니다.\n{}분 후 다시 시도해주세요.').format(lockout_minutes)

                return Response(
                    {'detail': error_msg},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 이메일 인증을 위한 토큰 생성 (비밀번호 검증 통과)
            verification_token = create_email_verification_request_token(user_obj)

            error_msg = '이메일 인증이 필요합니다. 회원가입 시 발송된 인증 이메일을 확인해주세요.'
            return Response(
                {
                    'detail': error_msg,
                    'verification_token': verification_token,
                    'requires_verification': True
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # 사용자가 존재하고 활성화된 경우, 비밀번호 확인
        user = authenticate(username=user_obj.username, password=password)

        if user is not None:
            # 로그인 성공
            django_login(request, user)
            # 시도 횟수 초기화
            clear_login_attempts(login_identifier, client_ip)

            # 비즈니스 로깅: 로그인 성공
            log_auth_event(logger, 'login', request, success=True, user=user)

            # JWT 토큰 생성
            refresh = RefreshToken.for_user(user)

            # 응답 생성 (토큰은 JSON에서 제거하고 HttpOnly 쿠키로 전달)
            response = Response({
                'detail': '로그인에 성공했습니다.',
                'user': {
                    'username': user.username,
                    'email': user.email,
                    'is_active': user.is_active
                }
            }, status=status.HTTP_200_OK)

            # JWT 토큰을 HttpOnly 쿠키로 설정
            set_jwt_cookies(
                response,
                access_token=str(refresh.access_token),
                refresh_token=str(refresh)
            )

            return response
        else:
            # 비밀번호가 틀린 경우
            user_attempts, ip_attempts = record_failed_login(login_identifier, client_ip)
            remaining_attempts = get_remaining_login_attempts(login_identifier, client_ip)
            lockout_minutes = get_lockout_minutes('login')

            # 비즈니스 로깅: 로그인 실패 (비밀번호 오류)
            log_auth_event(logger, 'login', request, success=False,
                          user=user_obj, reason='invalid_password',
                          remaining_attempts=remaining_attempts)

            if remaining_attempts > 0:
                error_msg = _('아이디 또는 비밀번호가 올바르지 않습니다.\n남은 시도 횟수: {}회').format(remaining_attempts)
            else:
                error_msg = _('로그인 시도 횟수를 초과했습니다.\n{}분 후 다시 시도해주세요.').format(lockout_minutes)

            return Response(
                {'detail': error_msg},
                status=status.HTTP_400_BAD_REQUEST
            )


class CustomRegisterView(APIView):
    """
    커스텀 회원가입 뷰 (dj-rest-auth 복잡한 플로우 우회)
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        from ..serializers import CustomRegisterSerializer

        # 브루트 포스 공격 방지
        client_ip = get_client_ip(request)
        email = request.data.get('email', '')

        if email:
            lockout_message = check_registration_attempts(client_ip)
            if lockout_message:
                return Response(
                    {'detail': lockout_message},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )

        # 시리얼라이저를 통한 검증 및 사용자 생성
        serializer = CustomRegisterSerializer(data=request.data)
        if serializer.is_valid():
            try:
                user = serializer.save(request)

                # 비즈니스 로깅: 회원가입 성공
                log_auth_event(logger, 'registration', request, success=True,
                              user=user, email=user.email)

                # 이메일 인증을 위한 토큰 생성
                verification_token = create_email_verification_request_token(user)

                return Response({
                    'detail': '회원가입이 완료되었습니다. 이메일을 확인하여 계정을 활성화해주세요.',
                    'user': {
                        'username': user.username,
                        'email': user.email,
                        'is_active': user.is_active
                    },
                    'verification_token': verification_token,
                    'requires_verification': True
                }, status=status.HTTP_201_CREATED)
            except Exception as e:
                logger.exception(f"Registration failed for email {email}")
                # 실패한 회원가입 기록
                if email:
                    record_failed_registration(client_ip)
                return Response(
                    {'detail': '회원가입에 실패했습니다. 다시 시도해주세요.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            # 유효성 검사 실패시 실패 기록
            if email:
                record_failed_registration(client_ip)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomLogoutView(APIView):
    """
    커스텀 로그아웃 뷰 - HttpOnly 쿠키 제거 및 refresh token 폐기

    POST /api/auth/logout/

    JWT 토큰이 HttpOnly 쿠키에 저장되어 있으므로
    로그아웃 시 쿠키를 제거하고 refresh token을 블랙리스트에 등록합니다.
    """
    authentication_classes = []
    permission_classes = []  # 이미 로그아웃된 사용자도 호출 가능

    def post(self, request, *args, **kwargs):
        from rest_framework_simplejwt.exceptions import TokenError
        from django.contrib.auth import logout as django_logout
        from ..utils.jwt_cookies import get_jwt_cookie_settings

        # 비즈니스 로깅: 로그아웃 (세션 파기 전에 user를 확보한다)
        user = request.user if hasattr(request, 'user') and request.user.is_authenticated else None
        log_auth_event(logger, 'logout', request, success=True, user=user)

        response = Response(
            {'detail': '로그아웃되었습니다.'},
            status=status.HTTP_200_OK
        )

        # refresh token 블랙리스트 등록 (탈취된 토큰 재사용 방지)
        cookie_settings = get_jwt_cookie_settings()
        refresh_token = request.COOKIES.get(cookie_settings['refresh_cookie_name'])
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass

        # Django 세션 파기: 로그인 시 django_login으로 세션이 생성되므로 로그아웃에서
        # django_logout으로 반드시 파기한다. 누락 시 공용 PC에서 세션 쿠키가 잔존해
        # allauth 경로·/admin 접근이 JWT 쿠키 제거와 무관하게 유지된다.
        django_logout(request)

        # HttpOnly 쿠키 제거
        clear_jwt_cookies(response)

        return response


class TokenRefreshView(APIView):
    """
    JWT 토큰 갱신 뷰 - HttpOnly 쿠키 기반

    POST /api/auth/token/refresh/

    HttpOnly 쿠키에 저장된 refresh_token을 사용하여
    새로운 access_token을 발급합니다.
    갱신된 토큰은 HttpOnly 쿠키로 다시 설정됩니다.
    """
    authentication_classes = []
    permission_classes = []  # refresh_token만 있으면 갱신 가능

    def post(self, request, *args, **kwargs):
        from rest_framework_simplejwt.exceptions import TokenError
        from ..utils.jwt_cookies import get_jwt_cookie_settings

        # HttpOnly 쿠키에서 refresh_token 추출
        cookie_settings = get_jwt_cookie_settings()
        refresh_token = request.COOKIES.get(cookie_settings['refresh_cookie_name'])

        if not refresh_token:
            return Response(
                {'detail': '리프레시 토큰이 없습니다.', 'code': 'refresh_token_missing'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            # refresh_token으로 새 토큰 발급
            refresh = RefreshToken(refresh_token)
            new_access_token = str(refresh.access_token)

            # ROTATE_REFRESH_TOKENS 설정에 따라 새 refresh_token 발급
            new_refresh_token = None
            from django.conf import settings
            simple_jwt_settings = getattr(settings, 'SIMPLE_JWT', {})
            if simple_jwt_settings.get('ROTATE_REFRESH_TOKENS', False):
                # 기존 토큰 블랙리스트에 추가
                try:
                    refresh.blacklist()
                except TokenError:
                    pass

                # 새 refresh 토큰 생성
                user = User.objects.get(id=refresh.payload.get('user_id'))
                new_refresh = RefreshToken.for_user(user)
                new_access_token = str(new_refresh.access_token)
                new_refresh_token = str(new_refresh)

            # 응답 생성
            response = Response(
                {'detail': '토큰이 갱신되었습니다.'},
                status=status.HTTP_200_OK
            )

            # 새 토큰을 HttpOnly 쿠키로 설정
            set_jwt_cookies(
                response,
                access_token=new_access_token,
                refresh_token=new_refresh_token if new_refresh_token else str(refresh)
            )

            return response

        except User.DoesNotExist:
            return Response(
                {'detail': '사용자를 찾을 수 없습니다.', 'code': 'user_not_found'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        except TokenError as e:
            return Response(
                {'detail': '유효하지 않거나 만료된 리프레시 토큰입니다.', 'code': 'token_invalid'},
                status=status.HTTP_401_UNAUTHORIZED
            )
