from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import FAQ, ContactInquiry
from .serializers import FAQSerializer, ContactInquiryCreateSerializer, ContactInquiryListSerializer
from .services.email import send_contact_notification
from apps.common.logging_utils import log_resource_event
import logging

logger = logging.getLogger(__name__)


class FAQListView(generics.ListAPIView):
    """
    FAQ 목록 조회 API

    인증 불필요. 활성화된 FAQ만 반환.
    """
    serializer_class = FAQSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return FAQ.objects.filter(is_active=True)


class ContactInquiryCreateView(generics.CreateAPIView):
    """
    문의 제출 API

    인증 필수. 로그인한 사용자의 정보를 자동으로 사용.
    """
    serializer_class = ContactInquiryCreateSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user

        # 일일 문의 횟수 제한 확인
        if not ContactInquiry.can_submit_inquiry(user):
            return Response(
                {
                    'detail': f'일일 문의 횟수({ContactInquiry.DAILY_INQUIRY_LIMIT}회)를 초과했습니다. 내일 다시 시도해주세요.',
                    'remaining': 0,
                    'limit': ContactInquiry.DAILY_INQUIRY_LIMIT
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        # 사용자 정보 자동 설정
        name = user.get_full_name() or user.username
        email = user.email

        inquiry = ContactInquiry.objects.create(
            user=user,
            name=name,
            email=email,
            subject=serializer.validated_data['subject'],
            message=serializer.validated_data['message'],
        )

        # 비즈니스 로깅: 문의 제출
        log_resource_event(logger, 'inquiry_submitted', request, 'inquiry', inquiry.id,
                          action='create', subject=inquiry.subject[:50])

        # 관리자에게 이메일 발송 (비동기 처리 권장, 현재는 동기)
        email_sent = send_contact_notification(inquiry)

        if not email_sent:
            logger.warning(f'문의는 저장되었으나 이메일 발송 실패: {inquiry.id}')

        remaining = ContactInquiry.get_remaining_inquiries(user)

        return Response(
            {
                'message': '문의가 정상적으로 접수되었습니다.',
                'remaining': remaining,
                'limit': ContactInquiry.DAILY_INQUIRY_LIMIT
            },
            status=status.HTTP_201_CREATED
        )


class ContactInquiryListView(generics.ListAPIView):
    """
    내 문의 이력 조회 API

    인증 필수. 로그인한 사용자의 문의 내역만 반환.
    """
    serializer_class = ContactInquiryListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ContactInquiry.objects.filter(user=self.request.user).order_by('-created_at')


class ContactInquiryStatusView(APIView):
    """
    문의 가능 상태 조회 API

    인증 필수. 오늘 남은 문의 횟수와 제한 정보 반환.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today_count = ContactInquiry.get_today_inquiry_count(user)
        remaining = max(0, ContactInquiry.DAILY_INQUIRY_LIMIT - today_count)

        return Response({
            'can_submit': remaining > 0,
            'remaining': remaining,
            'today_count': today_count,
            'limit': ContactInquiry.DAILY_INQUIRY_LIMIT
        })
