"""
알림 API 뷰

보안 강화:
- 모든 뷰에 IsAuthenticated 적용
- IDOR 방지: user=request.user 필터
- Rate Limiting 적용
- 404 응답 통일 (enumeration 방지)
"""
import logging
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle

from .models import Notification
from .serializers import NotificationSerializer, UnreadCountSerializer

logger = logging.getLogger(__name__)


class NotificationRateThrottle(UserRateThrottle):
    """알림 API Rate Limiting - 분당 60회"""
    rate = '60/minute'


class NotificationReadAllThrottle(UserRateThrottle):
    """모든 알림 읽음 처리 Rate Limiting - 분당 10회"""
    rate = '10/minute'


class NotificationListView(generics.ListAPIView):
    """
    알림 목록 조회

    GET /api/notifications/
    - 최근 50개 알림 반환
    - 읽지 않은 알림 우선 정렬
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [NotificationRateThrottle]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        """현재 사용자의 알림만 조회 (IDOR 방지)"""
        return Notification.objects.filter(
            user=self.request.user
        ).order_by('-created_at')[:50]


class UnreadCountView(APIView):
    """
    읽지 않은 알림 수 조회

    GET /api/notifications/unread-count/
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [NotificationRateThrottle]

    def get(self, request):
        count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).count()

        serializer = UnreadCountSerializer({'unread_count': count})
        return Response(serializer.data)


class NotificationReadView(APIView):
    """
    단일 알림 읽음 처리

    POST /api/notifications/{uuid}/read/

    보안:
    - user 필터로 IDOR 방지
    - 타 사용자 알림 접근 시 404 반환 (enumeration 방지)
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [NotificationRateThrottle]

    def post(self, request, pk):
        # IDOR 방지: 현재 사용자의 알림만 조회
        # 존재하지 않거나 다른 사용자 알림이면 404 (enumeration 방지)
        notification = get_object_or_404(
            Notification,
            pk=pk,
            user=request.user
        )

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=['is_read', 'read_at', 'updated_at'])
            logger.info(f"Notification {pk} marked as read by user {request.user.id}")

        return Response({'status': 'ok'})


class NotificationReadAllView(APIView):
    """
    모든 알림 읽음 처리

    POST /api/notifications/read-all/
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [NotificationReadAllThrottle]  # Rate limit 강화

    def post(self, request):
        updated_count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).update(
            is_read=True,
            read_at=timezone.now()
        )

        logger.info(f"Marked {updated_count} notifications as read for user {request.user.id}")
        return Response({
            'status': 'ok',
            'updated_count': updated_count
        })
