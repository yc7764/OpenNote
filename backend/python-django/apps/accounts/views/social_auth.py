import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.validators import validate_email
from django.core.exceptions import ValidationError

from ..models import AccountLinkingToken
from ..constants import SOCIAL_TEMP_TOKEN_COOKIE
from ..utils.email import send_social_email_verification
from ..utils import (
    get_client_ip,
    check_social_email_submit_attempts,
    record_social_email_submit_attempt,
    check_social_email_verify_attempts,
    record_social_email_verify_attempt,
    check_social_email_resend_attempts,
    record_social_email_resend_attempt,
    check_social_email_status_attempts,
    record_social_email_status_attempt,
    set_jwt_cookies,
    is_email_available,
    validate_uuid_or_error,
)
from apps.common.logging_utils import log_auth_event

User = get_user_model()
logger = logging.getLogger(__name__)


class SocialEmailSubmitView(APIView):
    """
    소셜 로그인 후 이메일 입력 처리 (이메일 인증 필요)

    POST /api/auth/social/submit-email/
    Body: {"temp_token": "uuid", "email": "user@example.com"}

    이메일이 없는 소셜 로그인 사용자가 이메일을 입력할 때 호출됩니다.
    이메일 인증 메일을 발송하고 인증 대기 상태로 전환합니다.
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        # Rate limiting 체크
        client_ip = get_client_ip(request)
        lockout_message = check_social_email_submit_attempts(client_ip)
        if lockout_message:
            return Response({
                'detail': lockout_message
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        try:
            # 임시 토큰은 HttpOnly 쿠키에서 읽는다(바디는 구버전 호환 폴백).
            temp_token = request.COOKIES.get(SOCIAL_TEMP_TOKEN_COOKIE) or request.data.get('temp_token')
            email = request.data.get('email', '').strip().lower()

            # 필수 필드 검증
            if not temp_token:
                return Response({
                    'detail': '임시 토큰이 필요합니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

            if not email:
                return Response({
                    'detail': '이메일 주소가 필요합니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 이메일 형식 검증
            try:
                validate_email(email)
            except ValidationError:
                return Response({
                    'detail': '유효하지 않은 이메일 형식입니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 임시 토큰 검증
            uuid_error = validate_uuid_or_error(temp_token, '임시 토큰')
            if uuid_error:
                return uuid_error

            try:
                linking_token = AccountLinkingToken.objects.get(
                    token=temp_token,
                    # R1: 이메일 입력 플로우는 set_password 타입 토큰(이메일 설정용으로
                    # 재활용)만 처리한다. link_type을 필터하지 않으면 merge_accounts 등
                    # 다른 용도의 토큰이 이 플로우에 투입돼 워크플로가 혼동된다.
                    link_type='set_password',
                    status__in=['pending', 'email_verification']
                )
            except AccountLinkingToken.DoesNotExist:
                return Response({
                    'detail': '유효하지 않거나 만료된 토큰입니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 토큰 만료 확인
            if linking_token.check_and_expire():
                return Response({
                    'detail': '토큰이 만료되었습니다. 다시 로그인해주세요.'
                }, status=status.HTTP_400_BAD_REQUEST)

            user = linking_token.user

            # 이메일 중복 확인
            if not is_email_available(email, exclude_user_id=user.id):
                return Response({
                    'detail': '이미 가입된 이메일입니다. 해당 이메일로 로그인 후 프로필 페이지에서 소셜 계정을 연결해주세요.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 이메일 인증 프로세스 시작 (이메일을 바로 저장하지 않음)
            linking_token.start_email_verification(email)

            # 인증 이메일 발송
            email_sent = send_social_email_verification(linking_token, email)
            if not email_sent:
                return Response({
                    'detail': '인증 이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Rate limiting 시도 기록
            record_social_email_submit_attempt(client_ip)

            logger.info(f"[SocialEmailSubmit] Verification email sent for user {user.id}: {email[:3]}***")

            # 인증 대기 상태 반환 (JWT 아직 발급 안함).
            # 임시 토큰은 콜백에서 심은 HttpOnly 쿠키가 그대로 유효하므로 바디로 돌려주지 않는다.
            return Response({
                'verification_required': True,
                'email': email,
                'message': '인증 이메일을 발송했습니다. 이메일을 확인해주세요.'
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"[SocialEmailSubmit] Unexpected error: {str(e)}", exc_info=True)
            return Response({
                'detail': '처리 중 오류가 발생했습니다.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SocialEmailVerifyView(APIView):
    """
    소셜 로그인 이메일 인증 완료 처리

    POST /api/auth/social/verify-email/
    Body: {"token": "uuid"}

    이메일 인증 링크에서 호출되어 인증을 완료하고 JWT를 발급합니다.
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        # Rate limiting 체크
        client_ip = get_client_ip(request)
        lockout_message = check_social_email_verify_attempts(client_ip)
        if lockout_message:
            return Response({
                'detail': lockout_message
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # Rate limiting 시도 기록
        record_social_email_verify_attempt(client_ip)

        try:
            token = request.data.get('token')

            # 토큰 형식 검증
            uuid_error = validate_uuid_or_error(token, '인증 토큰')
            if uuid_error:
                return uuid_error

            try:
                linking_token = AccountLinkingToken.objects.get(
                    email_verification_token=token,
                    # R1: 이메일 인증 확인도 set_password 타입 토큰만 처리한다.
                    link_type='set_password',
                    status='email_verification'
                )
            except AccountLinkingToken.DoesNotExist:
                return Response({
                    'detail': '유효하지 않거나 만료된 인증 토큰입니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 토큰 만료 확인
            if linking_token.check_and_expire():
                return Response({
                    'detail': '인증 토큰이 만료되었습니다. 다시 로그인해주세요.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 이메일 인증 완료 처리
            if not linking_token.complete_email_verification():
                return Response({
                    'detail': '이미 사용 중인 이메일입니다. 다른 이메일을 사용해주세요.'
                }, status=status.HTTP_400_BAD_REQUEST)

            user = linking_token.user
            logger.info(f"[SocialEmailVerify] Email verified for user {user.id}: {user.email[:3]}***")

            # 비즈니스 로깅: 소셜 이메일 인증 완료
            log_auth_event(logger, 'social_email_verified', request, success=True,
                          user=user, email=user.email, provider=linking_token.provider)

            # JWT 토큰 생성 및 HttpOnly 쿠키로 반환
            try:
                refresh = RefreshToken.for_user(user)

                # 응답 생성 (토큰은 JSON에서 제거하고 HttpOnly 쿠키로 전달)
                response = Response({
                    'verified': True,
                    'user': {
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                        'first_name': user.first_name,
                        'last_name': user.last_name,
                    },
                    'message': '이메일 인증이 완료되었습니다.'
                }, status=status.HTTP_200_OK)

                # JWT 토큰을 HttpOnly 쿠키로 설정
                set_jwt_cookies(
                    response,
                    access_token=str(refresh.access_token),
                    refresh_token=str(refresh)
                )
                # 흐름 종료 — 임시 토큰 쿠키 제거
                response.delete_cookie(SOCIAL_TEMP_TOKEN_COOKIE, path='/')

                return response

            except Exception as token_error:
                logger.error(f"[SocialEmailVerify] Token generation error: {str(token_error)}")
                return Response({
                    'detail': '토큰 생성에 실패했습니다.'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            logger.error(f"[SocialEmailVerify] Unexpected error: {str(e)}", exc_info=True)
            return Response({
                'detail': '처리 중 오류가 발생했습니다.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SocialEmailResendView(APIView):
    """
    소셜 로그인 이메일 인증 재전송

    POST /api/auth/social/resend-email/
    Body: {"temp_token": "uuid"}
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        # Rate limiting 체크
        client_ip = get_client_ip(request)
        lockout_message = check_social_email_resend_attempts(client_ip)
        if lockout_message:
            return Response({
                'detail': lockout_message
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        try:
            temp_token = request.COOKIES.get(SOCIAL_TEMP_TOKEN_COOKIE) or request.data.get('temp_token')

            # 토큰 형식 검증
            uuid_error = validate_uuid_or_error(temp_token, '임시 토큰')
            if uuid_error:
                return uuid_error

            try:
                linking_token = AccountLinkingToken.objects.get(
                    token=temp_token,
                    status='email_verification'
                )
            except AccountLinkingToken.DoesNotExist:
                return Response({
                    'detail': '유효하지 않거나 만료된 토큰입니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 토큰 만료 확인
            if linking_token.check_and_expire():
                return Response({
                    'detail': '토큰이 만료되었습니다. 다시 로그인해주세요.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 재전송 가능 여부 확인 (60초 쿨다운)
            can_resend, message = linking_token.can_resend_verification_email()
            if not can_resend:
                return Response({
                    'detail': message
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            # 인증 이메일 재발송
            email = linking_token.pending_email
            email_sent = send_social_email_verification(linking_token, email)

            if not email_sent:
                return Response({
                    'detail': '인증 이메일 발송에 실패했습니다.'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # 발송 시간 업데이트
            linking_token.email_verification_sent_at = timezone.now()
            linking_token.save(update_fields=['email_verification_sent_at'])

            # Rate limiting 시도 기록
            record_social_email_resend_attempt(client_ip)

            logger.info(f"[SocialEmailResend] Verification email resent for user {linking_token.user.id}")

            return Response({
                'message': '인증 이메일을 재전송했습니다.',
                'email': email
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"[SocialEmailResend] Unexpected error: {str(e)}", exc_info=True)
            return Response({
                'detail': '처리 중 오류가 발생했습니다.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SocialEmailVerifyStatusView(APIView):
    """
    소셜 로그인 이메일 인증 상태 확인

    POST /api/auth/social/verify-status/
    Body: {"temp_token": "uuid"}
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        # Rate limiting 체크
        client_ip = get_client_ip(request)
        lockout_message = check_social_email_status_attempts(client_ip)
        if lockout_message:
            return Response({
                'detail': lockout_message
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # Rate limiting 시도 기록
        record_social_email_status_attempt(client_ip)

        try:
            temp_token = request.COOKIES.get(SOCIAL_TEMP_TOKEN_COOKIE) or request.data.get('temp_token')

            # 토큰 형식 검증
            uuid_error = validate_uuid_or_error(temp_token, '임시 토큰')
            if uuid_error:
                return uuid_error

            try:
                linking_token = AccountLinkingToken.objects.get(token=temp_token)
            except AccountLinkingToken.DoesNotExist:
                return Response({
                    'detail': '유효하지 않은 토큰입니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 토큰 만료 확인 (completed/expired 상태는 제외)
            linking_token.check_and_expire(exclude_completed=True)

            if linking_token.status == 'completed':
                # completed 토큰을 원자적으로 1회만 소비한다.
                # 기존엔 exclude_completed=True로 만료가 배제돼 (1) expires_at 이후에도
                # JWT를 계속 발급하고 (2) 반복 폴링으로 재발급(replay)이 가능했다.
                # completed & 미만료인 경우에만 completed→expired 전이에 성공한 요청 하나가
                # JWT를 발급받는다(동시 요청 replay 차단 + 만료 검사 동시 처리).
                consumed = AccountLinkingToken.objects.filter(
                    token=linking_token.token,
                    status='completed',
                    expires_at__gte=timezone.now(),
                ).update(status='expired')

                if consumed != 1:
                    return Response({
                        'status': 'expired',
                        'verified': False,
                        'detail': '토큰이 만료되었거나 이미 사용되었습니다.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                # 인증 완료됨 - JWT 발급 (HttpOnly 쿠키로)
                user = linking_token.user
                refresh = RefreshToken.for_user(user)

                # 응답 생성 (토큰은 JSON에서 제거하고 HttpOnly 쿠키로 전달)
                response = Response({
                    'status': 'completed',
                    'verified': True,
                    'user': {
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                    }
                }, status=status.HTTP_200_OK)

                # JWT 토큰을 HttpOnly 쿠키로 설정
                set_jwt_cookies(
                    response,
                    access_token=str(refresh.access_token),
                    refresh_token=str(refresh)
                )
                # 흐름 종료 — 임시 토큰 쿠키 제거
                response.delete_cookie(SOCIAL_TEMP_TOKEN_COOKIE, path='/')

                return response

            elif linking_token.status == 'email_verification':
                return Response({
                    'status': 'pending',
                    'verified': False,
                    'email': linking_token.pending_email
                }, status=status.HTTP_200_OK)

            elif linking_token.status == 'expired':
                return Response({
                    'status': 'expired',
                    'verified': False,
                    'detail': '토큰이 만료되었습니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

            else:
                return Response({
                    'status': linking_token.status,
                    'verified': False
                }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"[SocialEmailVerifyStatus] Unexpected error: {str(e)}", exc_info=True)
            return Response({
                'detail': '처리 중 오류가 발생했습니다.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
