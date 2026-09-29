"""
알림 API 직렬화

보안 강화:
- 필드 명시적 화이트리스트
- 내부 필드 노출 방지
"""
from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """알림 목록/상세 조회용 직렬화"""

    class Meta:
        model = Notification
        fields = [
            'id',
            'notification_type',
            'title',
            'message',
            'action_url',
            'is_read',
            'read_at',
            'created_at',
        ]
        # content_type, object_id, user 등 내부 필드 노출 방지
        read_only_fields = fields


class UnreadCountSerializer(serializers.Serializer):
    """읽지 않은 알림 수 응답"""
    unread_count = serializers.IntegerField()
