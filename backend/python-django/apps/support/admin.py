import logging

from django.contrib import admin
from django.db import transaction
from django.utils.html import format_html
from django.utils import timezone
from .models import FAQ, ContactInquiry

logger = logging.getLogger(__name__)


@admin.register(FAQ)
class FAQAdmin(admin.ModelAdmin):
    """FAQ 관리자 설정"""

    list_display = (
        'question_preview', 'category', 'order', 'is_active', 'created_at', 'updated_at'
    )
    list_filter = ('category', 'is_active', 'created_at')
    search_fields = ('question', 'answer')
    list_editable = ('order', 'is_active')
    ordering = ('category', 'order', 'created_at')
    list_per_page = 25

    fieldsets = (
        ('기본 정보', {
            'fields': ('category', 'question', 'answer')
        }),
        ('설정', {
            'fields': ('order', 'is_active'),
            'classes': ('collapse',)
        }),
    )

    def question_preview(self, obj):
        """질문 미리보기 (50자 제한)"""
        if len(obj.question) > 50:
            return f"{obj.question[:50]}..."
        return obj.question
    question_preview.short_description = '질문'


@admin.register(ContactInquiry)
class ContactInquiryAdmin(admin.ModelAdmin):
    """문의 관리자 설정"""

    list_display = (
        'subject_preview', 'name', 'email', 'user_link', 'is_read', 'reply_status', 'created_at'
    )
    list_filter = ('is_read', 'created_at', ('admin_reply', admin.EmptyFieldListFilter))
    search_fields = ('name', 'email', 'subject', 'message', 'user__username', 'user__email')
    list_editable = ('is_read',)
    ordering = ('-created_at',)
    list_per_page = 25
    readonly_fields = ('user', 'name', 'email', 'subject', 'message', 'created_at', 'replied_at', 'replied_by')
    list_select_related = ('user', 'replied_by')

    fieldsets = (
        ('발신자 정보', {
            'fields': ('user', 'name', 'email')
        }),
        ('문의 내용', {
            'fields': ('subject', 'message')
        }),
        ('관리자 답변', {
            'fields': ('admin_reply', 'replied_at', 'replied_by'),
            'description': '문의에 대한 답변을 작성하세요. 저장 시 자동으로 답변 시간과 답변자가 기록됩니다.'
        }),
        ('관리', {
            'fields': ('is_read', 'created_at')
        }),
    )

    def subject_preview(self, obj):
        """제목 미리보기 (30자 제한)"""
        if len(obj.subject) > 30:
            return f"{obj.subject[:30]}..."
        return obj.subject
    subject_preview.short_description = '제목'

    def user_link(self, obj):
        """사용자 링크"""
        if obj.user:
            return format_html(
                '<a href="/admin/accounts/user/{}/change/">{}</a>',
                obj.user.id,
                obj.user.username
            )
        return '-'
    user_link.short_description = '사용자'

    def reply_status(self, obj):
        """답변 상태"""
        if obj.admin_reply:
            return format_html(
                '<span style="color: green; font-weight: bold;">✓ 답변완료</span>'
            )
        return format_html(
            '<span style="color: orange;">대기중</span>'
        )
    reply_status.short_description = '답변상태'

    def has_add_permission(self, request):
        """관리자 페이지에서 문의 추가 불가"""
        return False

    def save_model(self, request, obj, form, change):
        """저장 시 답변 관련 필드 자동 설정 및 알림 발송"""
        is_new_reply = False

        if change and 'admin_reply' in form.changed_data:
            if obj.admin_reply:
                # 새 답변인지 확인 (기존에 답변이 없었고 새로 추가된 경우)
                try:
                    old_obj = ContactInquiry.objects.get(pk=obj.pk)
                    is_new_reply = not old_obj.admin_reply
                except ContactInquiry.DoesNotExist:
                    is_new_reply = True

                # 답변이 작성되면 자동으로 읽음 처리 및 답변 정보 기록
                obj.is_read = True
                obj.replied_at = timezone.now()
                obj.replied_by = request.user
            else:
                # 답변이 삭제되면 답변 정보도 삭제
                obj.replied_at = None
                obj.replied_by = None

        super().save_model(request, obj, form, change)

        # 새 답변인 경우에만 알림 발송 (수정은 제외)
        if is_new_reply and obj.user:
            try:
                from apps.notifications.tasks import send_inquiry_reply_notification
                # Idempotency key: inquiry_id + replied_at (중복 방지)
                idempotency_key = f"{obj.pk}:{obj.replied_at.isoformat()}"

                # transaction.on_commit()을 사용하여 트랜잭션 커밋 후에만 task dispatch
                # 이렇게 하면 워커가 DB를 조회할 때 이미 admin_reply가 저장된 상태를 보장
                transaction.on_commit(
                    lambda pk=obj.pk, key=idempotency_key: send_inquiry_reply_notification.delay(pk, key)
                )
                logger.info(f"Notification task queued for inquiry {obj.pk}")
            except Exception as e:
                # 알림 실패가 저장을 막지 않도록 예외 처리
                logger.error(f"Failed to queue notification for inquiry {obj.pk}: {e}")
