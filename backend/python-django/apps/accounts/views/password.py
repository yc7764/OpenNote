"""
비밀번호 관련 뷰 (재설정, 변경)
"""
import logging
from django.http import HttpResponseRedirect
from django.views import View
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils.translation import gettext_lazy as _
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)

from ..utils import (
    get_client_ip, check_password_reset_attempts, record_failed_password_reset,
    clear_password_reset_attempts, get_remaining_attempts, get_lockout_minutes,
    create_email_verification_request_token,
    set_jwt_cookies,
)
from ..utils.email import send_password_reset_email
from ..utils.frontend import build_frontend_url
from ..validators import (
    validate_password_length, validate_password_complexity, validate_passwords_match,
    PASSWORD_LENGTH_ERROR_MESSAGE, PASSWORD_COMPLEXITY_ERROR_MESSAGE
)
from apps.common.logging_utils import log_auth_event

User = get_user_model()


def revoke_all_refresh_tokens(user):
    """사용자의 모든 미폐기 refresh 토큰을 블랙리스트 처리한다.

    비밀번호 변경·재설정 시 호출한다. 탈취된 토큰을 가진 공격자는 비밀번호가
    바뀌어도 기존 refresh 토큰(최대 7일)으로 access 토큰을 계속 갱신할 수 있어,
    피해자의 유일한 대응 수단인 비밀번호 변경이 무력화된다. 기존 토큰을 모두
    폐기해 재로그인을 강제한다. token_blacklist 앱이 설치돼 있어야 한다(로그아웃
    경로가 이미 blacklist를 사용하므로 설치돼 있음).
    """
    from rest_framework_simplejwt.token_blacklist.models import (
        OutstandingToken, BlacklistedToken,
    )
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class CustomPasswordResetView(APIView):
    """
    브루트 포스 공격 방지가 적용된 비밀번호 재설정 뷰
    """
    authentication_classes = []
    permission_classes = []  # 인증 없이 접근 가능

    def post(self, request, *args, **kwargs):
        # 클라이언트 IP 주소 가져오기
        client_ip = get_client_ip(request)
        email = request.data.get('email', '')

        # 브루트 포스 공격 방지 - 비밀번호 재설정 시도 횟수 체크
        if email:
            lockout_message = check_password_reset_attempts(email, client_ip)
            lockout_minutes = get_lockout_minutes('password_reset')
            error_msg = _('비밀번호 재설정 시도 횟수를 초과했습니다.\n{}분 후 다시 시도해주세요.').format(lockout_minutes)
            if lockout_message:
                return Response(
                    {'detail': error_msg},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )

        # 사용자 존재 여부 확인
        try:
            user = User.objects.get(email=email)
            user_exists = True
        except User.DoesNotExist:
            user_exists = False

        # 존재 여부와 무관하게 동일하게 기록하고 동일하게 응답한다 —
        # 미등록 이메일에 다른 메시지·상태코드를 주면 임의 이메일의
        # 가입 여부를 열거할 수 있다
        email_attempts, ip_attempts = record_failed_password_reset(email, client_ip)
        remaining_attempts = get_remaining_attempts('password_reset', email, 'email')
        lockout_minutes = get_lockout_minutes('password_reset')

        # 시도 횟수 초과 시 차단 (존재 여부와 무관하게 동일 응답)
        if remaining_attempts <= 0:
            error_msg = _('비밀번호 재설정 시도 횟수를 초과했습니다.\n{}분 후 다시 시도해주세요.').format(lockout_minutes)
            return Response(
                {'detail': error_msg},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        if user_exists:
            # 비밀번호 재설정 URL 생성
            from django.contrib.auth.tokens import default_token_generator
            from django.utils.http import urlsafe_base64_encode
            from django.utils.encoding import force_bytes

            token = default_token_generator.make_token(user)
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            reset_url = request.build_absolute_uri(f'/password-reset-confirm/{uid}/{token}/')

            # 커스텀 이메일 전송 (템플릿 사용)
            send_password_reset_email(request, user, reset_url)

            # 비즈니스 로깅: 비밀번호 리셋 요청
            log_auth_event(logger, 'password_reset_request', request, success=True,
                          user=user, email=email)
        else:
            # 미등록 이메일 — 응답은 동일하게 유지하고 내부 로그만 남긴다
            log_auth_event(logger, 'password_reset_request', request, success=False,
                          email=email, reason='user_not_found')

        # 성공 응답 반환 (존재 여부와 무관하게 동일한 메시지·상태코드)
        success_msg = _('비밀번호 재설정 링크가 이메일로 전송되었습니다.')
        if remaining_attempts < 3:  # 시도 횟수가 적을 때만 경고 메시지 추가
            success_msg += f'\n남은 시도 횟수: {remaining_attempts}회'

        return Response(
            {'detail': success_msg},
            status=status.HTTP_200_OK
        )


class PasswordResetConfirmRedirectView(View):
    """
    이메일 링크를 클릭했을 때 프론트엔드로 리다이렉트하는 뷰
    """

    def get(self, request, uidb64, token):
        return HttpResponseRedirect(build_frontend_url('/reset-password', uid=uidb64, token=token))


class PasswordResetTokenValidationView(APIView):
    """
    비밀번호 재설정 토큰 검증 API (페이지 로드 시 토큰 유효성 확인)
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        uid = request.data.get('uid')
        token = request.data.get('token')

        if not uid or not token:
            return Response(
                {'detail': 'UID와 토큰이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # uid 디코딩 및 사용자 검증
            from django.utils.http import urlsafe_base64_decode
            from django.utils.encoding import force_str
            from django.contrib.auth.tokens import default_token_generator

            decoded_uid = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=decoded_uid)

            # 토큰 검증
            if default_token_generator.check_token(user, token):
                return Response(
                    {
                        'is_valid': True,
                        'email': user.email,
                        'message': '토큰이 유효합니다.'
                    },
                    status=status.HTTP_200_OK
                )
            else:
                return Response(
                    {
                        'is_valid': False,
                        'message': '토큰이 만료되었거나 유효하지 않습니다.'
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {
                    'is_valid': False,
                    'message': '유효하지 않은 사용자 ID입니다.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )


class CustomPasswordResetConfirmView(APIView):
    """
    비밀번호 재설정 확인 뷰 - 완전히 커스텀 구현
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        try:
            # 데이터 추출
            uid = request.data.get('uid')
            token = request.data.get('token')
            new_password1 = request.data.get('new_password1')
            new_password2 = request.data.get('new_password2')

            # 필수 필드 검증
            if not all([uid, token, new_password1, new_password2]):
                return Response(
                    {'detail': '모든 필드를 입력해주세요.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 비밀번호 검증
            try:
                validate_passwords_match(new_password1, new_password2)
            except Exception:
                return Response(
                    {'new_password2': ['비밀번호가 일치하지 않습니다.']},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                validate_password_length(new_password1)
            except Exception:
                return Response(
                    {'new_password1': [PASSWORD_LENGTH_ERROR_MESSAGE]},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                validate_password_complexity(new_password1)
            except Exception:
                return Response(
                    {'new_password1': [PASSWORD_COMPLEXITY_ERROR_MESSAGE]},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # uid 디코딩 및 사용자 검증
            from django.utils.http import urlsafe_base64_decode
            from django.utils.encoding import force_str
            from django.contrib.auth.tokens import default_token_generator

            try:
                decoded_uid = force_str(urlsafe_base64_decode(uid))
                user = User.objects.get(pk=decoded_uid)
            except (TypeError, ValueError, OverflowError, User.DoesNotExist) as e:
                return Response(
                    {'uid': ['Invalid value']},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 토큰 검증
            if not default_token_generator.check_token(user, token):
                return Response(
                    {'token': ['Invalid value']},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 비밀번호 변경
            user.set_password(new_password1)
            user.save()

            # 기존 발급 JWT를 전부 폐기한다. 재설정은 미인증 경로라 유지할 현재
            # 세션이 없으므로 전량 폐기 후 재로그인을 강제한다(탈취 토큰 무효화).
            revoke_all_refresh_tokens(user)

            # 비즈니스 로깅: 비밀번호 리셋 완료
            log_auth_event(logger, 'password_reset_confirm', request, success=True,
                          user=user, email=user.email)

            # 실제 비밀번호 변경이 성공한 경우에만 시도 횟수 초기화
            try:
                client_ip = get_client_ip(request)
                clear_password_reset_attempts(user.email, client_ip)
            except Exception as e:
                pass

            response_data = {
                'detail': '비밀번호가 성공적으로 재설정되었습니다.',
                'user_email': user.email,
                'is_active': user.is_active
            }

            # 이메일 인증이 안된 경우 토큰 생성
            if not user.is_active:
                verification_token = create_email_verification_request_token(user)
                response_data['verification_token'] = verification_token
                response_data['requires_verification'] = True

            return Response(response_data, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("Password reset confirm failed")
            return Response(
                {'detail': '비밀번호 재설정 중 오류가 발생했습니다.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ChangePasswordView(APIView):
    """
    비밀번호 변경 API
    """

    def post(self, request, *args, **kwargs):
        try:
            user = request.user
            current_password = request.data.get('current_password')
            new_password = request.data.get('new_password')
            confirm_password = request.data.get('confirm_password')

            # 필수 필드 검증
            if not all([current_password, new_password, confirm_password]):
                return Response(
                    {'detail': '모든 필드를 입력해주세요.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 현재 비밀번호 확인
            if not user.check_password(current_password):
                return Response(
                    {'current_password': ['현재 비밀번호가 올바르지 않습니다.']},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 새 비밀번호 검증
            try:
                validate_passwords_match(new_password, confirm_password)
            except Exception:
                return Response(
                    {'confirm_password': ['새 비밀번호가 일치하지 않습니다.']},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                validate_password_length(new_password)
            except Exception:
                return Response(
                    {'new_password': [PASSWORD_LENGTH_ERROR_MESSAGE]},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                validate_password_complexity(new_password)
            except Exception:
                return Response(
                    {'new_password': [PASSWORD_COMPLEXITY_ERROR_MESSAGE]},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 비밀번호 변경
            user.set_password(new_password)
            user.save()

            # 기존 발급 JWT를 전부 폐기해 탈취 토큰을 무효화한다. 다만 본인의 현재
            # 세션까지 끊기면 UX가 나빠지므로, 전량 폐기 직후 새 토큰 쌍을 발급해
            # 쿠키를 갱신한다(다른 기기·탈취 세션은 폐기, 본인 현재 세션만 지속).
            revoke_all_refresh_tokens(user)

            # 비즈니스 로깅: 비밀번호 변경
            log_auth_event(logger, 'password_change', request, success=True, user=user)

            response = Response({
                'detail': '비밀번호가 성공적으로 변경되었습니다.'
            }, status=status.HTTP_200_OK)

            # 현재 세션 유지: 새 토큰 발급 후 쿠키 갱신 + Django 세션 해시 갱신
            from rest_framework_simplejwt.tokens import RefreshToken
            from django.contrib.auth import update_session_auth_hash
            refresh = RefreshToken.for_user(user)
            set_jwt_cookies(
                response,
                access_token=str(refresh.access_token),
                refresh_token=str(refresh)
            )
            update_session_auth_hash(request, user)

            return response

        except Exception as e:
            logger.exception(f"Password change failed for user {request.user.id}")
            return Response(
                {'detail': '비밀번호 변경 중 오류가 발생했습니다.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
