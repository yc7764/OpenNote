"""
알림 모델

보안 강화 사항:
- UUID primary key (ID Enumeration 방지)
- 복합 인덱스 (성능 최적화)
- GenericFK (확장성)
"""
import uuid
from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType


class NotificationType(models.TextChoices):
    """알림 유형"""
    INQUIRY_REPLY = 'inquiry_reply', '문의 답변'
    SYSTEM = 'system', '시스템 공지'
    # 향후 확장 가능: NOTE_SHARE, STT_COMPLETE, SUBSCRIPTION 등


class Notification(models.Model):
    """
    사용자 알림 모델

    보안:
    - UUID PK로 ID enumeration 방지
    - user 필터로 IDOR 방지 (views에서 처리)

    성능:
    - 복합 인덱스로 쿼리 최적화
    - GenericFK로 다양한 객체 참조
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name='알림 ID'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name='사용자'
    )
    notification_type = models.CharField(
        max_length=50,
        choices=NotificationType.choices,
        verbose_name='알림 유형'
    )
    title = models.CharField(
        max_length=200,
        verbose_name='제목'
    )
    message = models.TextField(
        verbose_name='내용'
    )

    # GenericForeignKey - 다양한 모델 참조 가능
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='참조 타입'
    )
    object_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='참조 ID'
    )
    content_object = GenericForeignKey('content_type', 'object_id')

    action_url = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='이동 URL'
    )
    is_read = models.BooleanField(
        default=False,
        verbose_name='읽음 여부'
    )
    read_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='읽은 시각'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='생성 시각'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='수정 시각'
    )

    class Meta:
        verbose_name = '알림'
        verbose_name_plural = '알림 목록'
        ordering = ['-created_at']
        indexes = [
            # unread count 쿼리 최적화
            models.Index(fields=['user', 'is_read'], name='notif_user_read_idx'),
            # 목록 조회 최적화
            models.Index(fields=['user', '-created_at'], name='notif_user_created_idx'),
            # cleanup 태스크 최적화
            models.Index(fields=['created_at'], name='notif_created_idx'),
        ]

    def __str__(self):
        read_status = '읽음' if self.is_read else '안읽음'
        return f'[{read_status}] {self.title} - {self.user.email}'

    def mark_as_read(self):
        """알림을 읽음 처리"""
        from django.utils import timezone
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at', 'updated_at'])
