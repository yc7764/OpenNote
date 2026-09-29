from django.db import models
from django.conf import settings


class FAQ(models.Model):
    """자주 묻는 질문 모델"""

    CATEGORY_CHOICES = [
        ('usage', '사용방법'),
        ('account', '계정'),
        ('technical', '기술'),
        ('other', '기타'),
    ]

    category = models.CharField(
        max_length=50,
        choices=CATEGORY_CHOICES,
        default='usage',
        verbose_name='카테고리'
    )
    question = models.CharField(max_length=500, verbose_name='질문')
    answer = models.TextField(verbose_name='답변')
    order = models.PositiveIntegerField(default=0, verbose_name='정렬 순서')
    is_active = models.BooleanField(default=True, verbose_name='활성화')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='생성일')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='수정일')

    class Meta:
        verbose_name = '자주 묻는 질문'
        verbose_name_plural = '자주 묻는 질문'
        ordering = ['category', 'order', 'created_at']

    def __str__(self):
        return f"[{self.get_category_display()}] {self.question[:50]}"


class ContactInquiry(models.Model):
    """문의 모델"""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inquiries',
        verbose_name='사용자'
    )
    name = models.CharField(max_length=100, verbose_name='이름')
    email = models.EmailField(verbose_name='이메일')
    subject = models.CharField(max_length=200, verbose_name='제목')
    message = models.TextField(verbose_name='내용')
    is_read = models.BooleanField(default=False, verbose_name='읽음')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='접수일')

    # 관리자 답변 필드
    admin_reply = models.TextField(blank=True, verbose_name='관리자 답변')
    replied_at = models.DateTimeField(null=True, blank=True, verbose_name='답변일')
    replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replied_inquiries',
        verbose_name='답변 관리자'
    )

    # 일일 문의 횟수 제한을 위한 설정
    DAILY_INQUIRY_LIMIT = 3

    class Meta:
        verbose_name = '문의'
        verbose_name_plural = '문의'
        ordering = ['-created_at']
        # 사용자별 문의 조회·일일 제한 카운트(user + created_at__date) 지원
        indexes = [
            models.Index(fields=['user', 'created_at']),
        ]

    def __str__(self):
        return f"[{self.created_at.strftime('%Y-%m-%d')}] {self.subject[:30]}"

    @property
    def has_reply(self):
        """답변 여부"""
        return bool(self.admin_reply)

    @classmethod
    def get_today_inquiry_count(cls, user):
        """사용자의 오늘 문의 횟수 조회"""
        from django.utils import timezone
        # L4: created_at__date는 TIME_ZONE(Asia/Seoul) 기준 날짜로 비교되므로 '오늘'도
        # 같은 타임존 기준이어야 한다. now().date()는 UTC 날짜라 KST 00~09시 사이엔
        # 전날 기준으로 집계돼 일일 제한이 사실상 09시에 리셋됐다. localdate()로 맞춘다.
        today = timezone.localdate()
        return cls.objects.filter(
            user=user,
            created_at__date=today
        ).count()

    @classmethod
    def can_submit_inquiry(cls, user):
        """문의 가능 여부 확인"""
        return cls.get_today_inquiry_count(user) < cls.DAILY_INQUIRY_LIMIT

    @classmethod
    def get_remaining_inquiries(cls, user):
        """남은 문의 가능 횟수"""
        return max(0, cls.DAILY_INQUIRY_LIMIT - cls.get_today_inquiry_count(user))
