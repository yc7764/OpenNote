"""
이메일 변경 관련 뷰
"""
import logging
from django.http import HttpResponseRedirect
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model

from ..models import EmailChangeRequest
from ..utils import (
    get_client_ip,
    check_email_change_request_attempts, record_failed_email_change_request,
    clear_email_change_request_attempts,
    check_email_change_resend_attempts, record_failed_email_change_resend,
    is_email_available,
)
from ..utils.email import send_email_change_email
from ..utils.frontend import build_frontend_url
from apps.common.logging_utils import log_auth_event

logger = logging.getLogger(__name__)
User = get_user_model()


class EmailChangeRequestView(APIView):
    """프로필 이메일 변경 요청 생성"""
    def post(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return Response({'detail': '인증 필요'}, status=status.HTTP_401_UNAUTHORIZED)

        new_email = request.data.get('new_email', '').strip().lower()
        current_password = request.data.get('current_password', '')
        client_ip = get_client_ip(request)

        # 시도 제한 확인
        lock = check_email_change_request_attempts(str(user.id), client_ip)
        if lock:
            return Response({'detail': lock}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # 기본 검증
        if not new_email:
            record_failed_email_change_request(str(user.id), client_ip)
            return Response({'detail': '새 이메일이 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_email == user.email:
            record_failed_email_change_request(str(user.id), client_ip)
            return Response({'detail': '현재 이메일과 동일합니다.'}, status=status.HTTP_400_BAD_REQUEST)
        if not is_email_available(new_email, exclude_user_id=user.id):
            record_failed_email_change_request(str(user.id), client_ip)
            return Response({'detail': '이미 사용 중인 이메일입니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 비밀번호 확인
        # 소셜 전용 계정(비밀번호 없음)은 authenticate가 항상 실패해
        # 이메일 변경이 원천 봉쇄됐다(UX 버그). 이미 JWT로 인증된 요청이므로
        # 비밀번호가 없는 계정은 비밀번호 재확인을 건너뛴다.
        if user.has_usable_password():
            from django.contrib.auth import authenticate
            if not authenticate(username=user.username, password=current_password):
                record_failed_email_change_request(str(user.id), client_ip)
                return Response({'detail': '비밀번호가 올바르지 않습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 기존 미확정 요청 무효화
        EmailChangeRequest.objects.filter(user=user, is_confirmed=False).delete()

        # 만료 시간 설정
        expiry_minutes = getattr(settings, 'EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES', 30)
        expires_at = timezone.now() + timezone.timedelta(minutes=expiry_minutes)

        req = EmailChangeRequest.objects.create(user=user, new_email=new_email, expires_at=expires_at)

        # 메일 발송 링크
        verify_url = f"{request.scheme}://{request.get_host()}/verify-email-change/{req.token}/"
        send_email_change_email(user, new_email, verify_url)

        clear_email_change_request_attempts(str(user.id), client_ip)

        # 비즈니스 로깅: 이메일 변경 요청
        log_auth_event(logger, 'email_change_request', request, success=True,
                      user=user, email=new_email)

        return Response({'detail': '이메일 변경 확인 메일을 전송했습니다.', 'new_email': new_email}, status=status.HTTP_200_OK)


class EmailChangeResendView(APIView):
    def post(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return Response({'detail': '인증 필요'}, status=status.HTTP_401_UNAUTHORIZED)
        client_ip = get_client_ip(request)

        req = EmailChangeRequest.objects.filter(user=user, is_confirmed=False).order_by('-created_at').first()
        if not req:
            return Response({'detail': '대기 중인 이메일 변경 요청이 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        lock = check_email_change_resend_attempts(req.new_email, client_ip)
        if lock:
            return Response({'detail': lock}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        verify_url = f"{request.scheme}://{request.get_host()}/verify-email-change/{req.token}/"
        send_email_change_email(user, req.new_email, verify_url)
        # 재전송 카운터 기록 — 이 호출이 없으면 check가 참조하는 카운터가
        # 영원히 0이라 재전송 한도가 사실상 무제한이 된다
        record_failed_email_change_resend(req.new_email, client_ip)
        return Response({'detail': '재전송했습니다.'}, status=status.HTTP_200_OK)


class EmailChangeCancelView(APIView):
    def post(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return Response({'detail': '인증 필요'}, status=status.HTTP_401_UNAUTHORIZED)
        EmailChangeRequest.objects.filter(user=user, is_confirmed=False).delete()
        return Response({'detail': '이메일 변경 요청을 취소했습니다.'}, status=status.HTTP_200_OK)


class EmailChangeStatusView(APIView):
    def get(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return Response({'detail': '인증 필요'}, status=status.HTTP_401_UNAUTHORIZED)
        req = EmailChangeRequest.objects.filter(user=user, is_confirmed=False).order_by('-created_at').first()
        if not req:
            return Response({'pending': False})
        remaining = int((req.expires_at - timezone.now()).total_seconds())
        return Response({'pending': True, 'new_email': req.new_email, 'expires_in': max(0, remaining)})


def verify_email_change(request, token):
    try:
        req = EmailChangeRequest.objects.get(token=token)
        if not req.is_valid():
            return HttpResponseRedirect(build_frontend_url('/email-change', verified='false', error='expired'))
        # 1차: 애플리케이션 레벨 중복 체크
        if not is_email_available(req.new_email, exclude_user_id=req.user_id):
            return HttpResponseRedirect(build_frontend_url('/email-change', verified='false', error='conflict'))
        try:
            with transaction.atomic():
                req.user.email = req.new_email
                req.user.email_verified = True
                req.user.email_verified_at = timezone.now()
                req.user.save(update_fields=['email', 'email_verified', 'email_verified_at'])

                # M4: allauth EmailAddress를 새 이메일로 동기화한다(기존 제거 후
                # verified·primary로 재생성). 미동기화 시 이전 이메일의 stale
                # EmailAddress(verified=True)가 남아, 타인이 그 이메일로 가입·인증할 때
                # allauth unique_verified_email 제약 위반으로 500이 난다.
                from allauth.account.models import EmailAddress
                EmailAddress.objects.filter(user=req.user).delete()
                EmailAddress.objects.create(
                    user=req.user,
                    email=req.new_email,
                    verified=True,
                    primary=True,
                )
        except IntegrityError:
            # 2차: DB unique 제약 위반 (경합 조건 발생 시)
            return HttpResponseRedirect(build_frontend_url('/email-change', verified='false', error='conflict'))
        req.is_confirmed = True
        req.save(update_fields=['is_confirmed'])

        # 비즈니스 로깅: 이메일 변경 완료
        log_auth_event(logger, 'email_change_completed', request, success=True,
                      user=req.user, email=req.new_email)

        return HttpResponseRedirect(build_frontend_url('/email-change', verified='true'))
    except EmailChangeRequest.DoesNotExist:
        return HttpResponseRedirect(build_frontend_url('/email-change', verified='false', error='invalid'))
