"""
알림 Admin 설정
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    """알림 관리 Admin"""

    list_display = [
        'short_id',
        'user_email',
        'notification_type',
        'title',
        'read_status',
        'created_at',
    ]
    list_filter = [
        'notification_type',
        'is_read',
        'created_at',
    ]
    search_fields = [
        'title',
        'message',
        'user__email',
    ]
    readonly_fields = [
        'id',
        'user',
        'notification_type',
        'title',
        'message',
        'content_type',
        'object_id',
        'action_url',
        'is_read',
        'read_at',
        'created_at',
        'updated_at',
    ]
    ordering = ['-created_at']
    date_hierarchy = 'created_at'

    def short_id(self, obj):
        """UUID 축약 표시"""
        return str(obj.id)[:8]
    short_id.short_description = 'ID'

    def user_email(self, obj):
        """사용자 이메일"""
        return obj.user.email
    user_email.short_description = '사용자'

    def read_status(self, obj):
        """읽음 상태 표시"""
        if obj.is_read:
            return format_html('<span style="color: green;">읽음</span>')
        return format_html('<span style="color: red;">안읽음</span>')
    read_status.short_description = '상태'

    def has_add_permission(self, request):
        """알림은 시스템에서만 생성"""
        return False

    def has_change_permission(self, request, obj=None):
        """알림 수정 불가"""
        return False

    def has_delete_permission(self, request, obj=None):
        """삭제 허용 (관리 목적)"""
        return True
