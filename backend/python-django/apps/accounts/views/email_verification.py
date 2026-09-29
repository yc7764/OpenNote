"""
이메일 인증 관련 뷰
"""
import logging
from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model

import uuid
from ..utils import (
    get_client_ip, check_email_verification_resend_attempts,
    record_failed_email_verification_resend,
    check_email_verify_status_attempts, record_email_verify_status_attempt,
    create_email_verification_token, get_user_from_verification_token
)
from ..utils.email import send_email_verification_email
from ..utils.frontend import build_frontend_url
from apps.common.logging_utils import log_auth_event

logger = logging.getLogger(__name__)
User = get_user_model()


def verify_email(request, token):
    """
    이메일 인증 링크 처리 (웹페이지에서 직접 접근)
    """
    from ..models import EmailVerification

    try:
        verification = EmailVerification.objects.get(token=token)
        if verification.is_valid() and not verification.is_verified:
            user = verification.user
            user.is_active = True
            user.email_verified = True
            user.email_verified_at = timezone.now()
            user.save(update_fields=['is_active', 'email_verified', 'email_verified_at'])

            # 샘플 노트 생성 (인증 완료된 사용자만)
            from apps.notes.sample_note import create_sample_note_if_needed
            create_sample_note_if_needed(user)

            verification.is_verified = True
            verification.save()

            # allauth EmailAddress 인증 상태 업데이트
            # 소셜 로그인 연결 시 wipe_password() 방지를 위해 필요
            from allauth.account.models import EmailAddress
            EmailAddress.objects.update_or_create(
                user=user,
                email=user.email,
                defaults={'verified': True, 'primary': True}
            )

            # 비즈니스 로깅: 이메일 인증 완료
            log_auth_event(logger, 'email_verified', request, success=True,
                          user=user, email=user.email)

            # 보안 토큰 생성 (이메일 노출 방지)
            verification_token = create_email_verification_token(user)
            return HttpResponseRedirect(build_frontend_url(
                '/email-verification',
                verified='true',
                token=verification_token
            ))
        else:
            # 만료되거나 유효하지 않은 링크
            return HttpResponseRedirect(build_frontend_url(
                '/email-verification',
                verified='false',
                error='expired'
            ))
    except EmailVerification.DoesNotExist:
        # 유효하지 않은 토큰
        return HttpResponseRedirect(build_frontend_url(
            '/email-verification',
            verified='false',
            error='invalid'
        ))


class EmailVerificationStatusView(APIView):
    """
    이메일 인증 상태 확인 API
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request, *args, **kwargs):
        # GET 요청은 더 이상 지원하지 않음 (보안상 URL에 이메일 노출 방지)
        return Response(
            {'detail': 'POST 요청을 사용해주세요.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        if not email:
            return Response(
                {'detail': '이메일을 입력해주세요.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 응답이 활성 계정 여부로 갈리므로(is_verified) 대량 이메일 대입으로
        # 가입 활성 계정을 열거할 수 있다. 정상 폴링(본인 이메일 확인)은 저빈도이므로
        # IP 스로틀로 대량 조회만 차단한다.
        client_ip = get_client_ip(request)
        lockout_message = check_email_verify_status_attempts(client_ip)
        if lockout_message:
            return Response(
                {'detail': lockout_message},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        record_email_verify_status_attempt(client_ip)

        try:
            user = User.objects.get(email=email)
            if user.is_active:
                return Response(
                    {'is_verified': True, 'message': '이메일 인증이 완료된 계정입니다.'},
                    status=status.HTTP_200_OK
                )
            else:
                return Response(
                    {'is_verified': False, 'message': '이메일 인증이 필요합니다.'},
                    status=status.HTTP_200_OK
                )
        except User.DoesNotExist:
            # 이메일 열거 공격 방지: 존재 여부와 관계없이 동일한 응답 반환
            return Response(
                {'is_verified': False, 'message': '이메일 인증이 필요합니다.'},
                status=status.HTTP_200_OK
            )


class EmailVerificationTokenView(APIView):
    """
    이메일 인증 토큰 검증 API (완료 토큰과 요청 토큰 모두 처리)
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        token = request.data.get('token')
        if not token:
            return Response(
                {'detail': '토큰을 입력해주세요.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = get_user_from_verification_token(token)
            if user:
                # 토큰 타입에 따라 다른 응답
                from ..utils import verify_email_verification_token
                payload = verify_email_verification_token(token)
                token_type = payload.get('type') if payload else None

                response_data = {
                    'email': user.email,
                    'is_verified': user.is_active
                }

                # 요청 토큰인 경우 추가 정보 제공
                if token_type == 'email_verification_request':
                    response_data['requires_verification'] = True

                return Response(response_data, status=status.HTTP_200_OK)
            else:
                return Response(
                    {'detail': '유효하지 않은 토큰입니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception:
            logger.exception("Email verification token validation failed")
            return Response(
                {'detail': '토큰 검증 중 오류가 발생했습니다.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ResendVerificationEmailView(APIView):
    """
    인증 이메일 재전송 API
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        if not email:
            return Response(
                {'detail': '이메일을 입력해주세요.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 브루트 포스 공격 방지 - 이메일 인증 재전송 시도 횟수 체크
        client_ip = get_client_ip(request)
        lockout_message = check_email_verification_resend_attempts(email, client_ip)
        if lockout_message:
            return Response(
                {'detail': lockout_message},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        try:
            user = User.objects.get(email=email)
            if user.is_active:
                # 이미 인증된 계정인 경우 실패 기록
                record_failed_email_verification_resend(email, client_ip)
                return Response(
                    {'detail': '이미 인증이 완료된 계정입니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 기존 인증 토큰 가져오기 또는 생성
            from ..models import EmailVerification
            email_verification, created = EmailVerification.objects.get_or_create(user=user)

            # 재전송 시 기존 토큰이 만료됐으면 새 토큰으로 재발급한다.
            # get_or_create는 옛 토큰을 그대로 재사용하고 created_at은 auto_now_add라
            # 갱신되지 않아, 24시간 지난 계정은 "재전송"해도 링크가 100% 만료돼
            # 계정을 살릴 방법이 없었다. 만료분만 토큰·created_at을 새로 발급한다.
            if not created and not email_verification.is_valid():
                EmailVerification.objects.filter(pk=email_verification.pk).update(
                    token=uuid.uuid4(), created_at=timezone.now(), is_verified=False
                )
                email_verification.refresh_from_db()

            # 인증 이메일 재전송 (템플릿 사용)
            verification_link = f"{request.scheme}://{request.get_host()}/verify-email/{email_verification.token}/"
            send_email_verification_email(request, user, verification_link)

            # 성공 시에도 시도 횟수 기록 (브루트 포스 방지를 위해 초기화하지 않음)
            record_failed_email_verification_resend(email, client_ip)

            return Response(
                {'detail': '인증 이메일이 재전송되었습니다.'},
                status=status.HTTP_200_OK
            )

        except User.DoesNotExist:
            # 이메일 열거 공격 방지: 존재하지 않는 이메일도 동일한 응답 반환
            record_failed_email_verification_resend(email, client_ip)
            return Response(
                {'detail': '인증 이메일이 재전송되었습니다.'},
                status=status.HTTP_200_OK
            )
