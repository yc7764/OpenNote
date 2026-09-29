from django.contrib.auth.models import AbstractUser
from django.db import models, IntegrityError
from django.db.models import F
from django.utils import timezone
from zoneinfo import ZoneInfo
import uuid

# 한국 표준시 타임존 상수
KST = ZoneInfo('Asia/Seoul')

class User(AbstractUser):
    """
    Master Account (통합 계정) - 모든 인증의 기본 신원
    소셜 계정들이 이 계정에 연결됨
    """
    # 인증 방식 선택지
    AUTH_METHOD_CHOICES = [
        ('email', 'Email/Password'),
        ('github', 'GitHub'),
        ('google', 'Google'),
        ('naver', 'Naver'),
        ('kakao', 'Kakao'),
    ]

    # 계정 생성 경로 선택지
    CREATED_VIA_CHOICES = [
        ('registration', 'Email Registration'),
        ('social_github', 'GitHub OAuth'),
        ('social_google', 'Google OAuth'),
        ('social_naver', 'Naver OAuth'),
        ('social_kakao', 'Kakao OAuth'),
    ]

    # AbstractUser has first_name, last_name, email. We override email to add unique constraint.
    email = models.EmailField(
        'email address',
        unique=True,
        blank=True,
        null=True,
        error_messages={
            'unique': '이미 사용 중인 이메일 주소입니다.',
        },
    )
    name = models.CharField(max_length=255, blank=True)

    # We override these fields to make them not required
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)

    # 소셜 로그인 관련 필드
    is_social_user = models.BooleanField(default=False)

    # === 통합 계정(Master Account) 관련 필드 ===
    # 기본 인증 방식 (계정 생성 시 사용한 방식)
    primary_auth_method = models.CharField(
        max_length=20,
        choices=AUTH_METHOD_CHOICES,
        default='email',
        verbose_name='기본 인증 방식'
    )

    # 이메일 인증 상태
    email_verified = models.BooleanField(
        default=False,
        verbose_name='이메일 인증 완료'
    )
    email_verified_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='이메일 인증 완료 시간'
    )

    # 계정 생성 경로
    created_via = models.CharField(
        max_length=20,
        choices=CREATED_VIA_CHOICES,
        default='registration',
        verbose_name='계정 생성 경로'
    )

    def __str__(self):
        return self.username

    def get_linked_providers(self) -> list[str]:
        """연결된 소셜 제공자 목록 반환 (allauth SocialAccount 사용)"""
        from allauth.socialaccount.models import SocialAccount
        return list(SocialAccount.objects.filter(user=self).values_list('provider', flat=True))

    def has_provider_linked(self, provider: str) -> bool:
        """특정 소셜 제공자 연결 여부 확인 (allauth SocialAccount 사용)"""
        from allauth.socialaccount.models import SocialAccount
        return SocialAccount.objects.filter(user=self, provider=provider).exists()

    def can_unlink_provider(self, provider: str) -> tuple[bool, str]:
        """
        소셜 제공자 연결 해제 가능 여부 확인
        비밀번호가 있거나 다른 소셜 계정이 있어야 해제 가능
        """
        if not self.has_provider_linked(provider):
            return False, "이 소셜 계정은 연결되어 있지 않습니다."

        from allauth.socialaccount.models import SocialAccount
        linked_count = SocialAccount.objects.filter(user=self).count()

        # 비밀번호가 없고 유일한 소셜 계정인 경우 해제 불가
        if linked_count == 1 and not self.has_usable_password():
            return False, "비밀번호를 설정하거나 다른 소셜 계정을 연결한 후에 연결 해제할 수 있습니다."

        return True, ""

    def get_linked_accounts_count(self) -> int:
        """연결된 소셜 계정 수 반환 (allauth SocialAccount 사용)"""
        from allauth.socialaccount.models import SocialAccount
        return SocialAccount.objects.filter(user=self).count()

class EmailVerification(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_verified = models.BooleanField(default=False)

    def is_valid(self):
        expiration_time = self.created_at + timezone.timedelta(hours=24)
        return timezone.now() <= expiration_time

    def __str__(self):
        return f"{self.user.email} - {self.is_verified}"


class EmailChangeRequest(models.Model):
    """프로필 이메일 변경 요청 기록"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='email_change_requests')
    new_email = models.EmailField()
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_confirmed = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=['new_email']),
            models.Index(fields=['user', 'is_confirmed']),
        ]

    def is_valid(self):
        return (not self.is_confirmed) and timezone.now() <= self.expires_at

    def __str__(self):
        return f"{self.user.username} -> {self.new_email} ({'confirmed' if self.is_confirmed else 'pending'})"

class SocialAccountMetadata(models.Model):
    """
    allauth SocialAccount의 확장 메타데이터

    allauth의 socialaccount.SocialAccount 모델에 추가 필드를 제공합니다.
    - access_count: 로그인 횟수
    - last_used_at: 마지막 사용 시간
    - linked_by: 연결 방법 (registration, auto_email, manual)
    """
    # 연결 방식 선택지
    LINKED_BY_CHOICES = [
        ('registration', '계정 생성 시'),
        ('auto_email', '이메일 자동 연결'),
        ('manual', '수동 연결'),
    ]

    # allauth SocialAccount와 1:1 관계
    social_account = models.OneToOneField(
        'socialaccount.SocialAccount',
        on_delete=models.CASCADE,
        related_name='metadata',
        verbose_name='소셜 계정'
    )

    # 연결 방식
    linked_by = models.CharField(
        max_length=20,
        choices=LINKED_BY_CHOICES,
        default='registration',
        verbose_name='연결 방식'
    )

    # 접근 추적
    access_count = models.PositiveIntegerField(
        default=0,
        verbose_name='접근 횟수'
    )
    last_used_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='마지막 사용 일시'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = '소셜 계정 메타데이터'
        verbose_name_plural = '소셜 계정 메타데이터'

    def __str__(self):
        return f"{self.social_account.user.username} - {self.social_account.provider}"

    def record_access(self):
        """소셜 로그인 접근 기록 (원자적 업데이트)"""
        SocialAccountMetadata.objects.filter(pk=self.pk).update(
            last_used_at=timezone.now(),
            access_count=F('access_count') + 1
        )
        # 로컬 인스턴스 업데이트
        self.last_used_at = timezone.now()
        self.access_count += 1

    @classmethod
    def get_or_create_for_account(cls, social_account, linked_by='auto_email'):
        """SocialAccount에 대한 메타데이터 가져오거나 생성"""
        metadata, created = cls.objects.get_or_create(
            social_account=social_account,
            defaults={
                'linked_by': linked_by,
                'access_count': 1,
                'last_used_at': timezone.now(),
            }
        )
        return metadata, created


# === 하위 호환성을 위한 별칭 ===
# 기존 코드에서 SocialAccount를 참조하는 경우를 위해
# allauth의 SocialAccount를 사용하도록 안내
# from allauth.socialaccount.models import SocialAccount  # 이제 allauth 모델 사용

class SocialVerificationToken(models.Model):
    """소셜 로그인 이메일 인증 토큰"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    provider = models.CharField(max_length=20)
    social_id = models.CharField(max_length=255)
    social_email = models.EmailField()
    social_name = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    
    def is_valid(self):
        return not self.is_used and timezone.now() <= self.expires_at
        
    def __str__(self):
        return f"{self.user.username} - {self.provider} - {self.token}"

class UserQuota(models.Model):
    """사용자 쿼터 및 사용량 추적"""

    class PlanType(models.TextChoices):
        FREE = 'free', '무료'
        BASIC = 'basic', '베이직'
        PRO = 'pro', '프로'

    # 플랜별 기본 제한값 (바이트 단위)
    PLAN_LIMITS = {
        'free': {'daily_note_limit': 20, 'storage_limit_bytes': 1 * 1024 * 1024 * 1024},  # 1GB
        'basic': {'daily_note_limit': 50, 'storage_limit_bytes': 5 * 1024 * 1024 * 1024},  # 5GB
        'pro': {'daily_note_limit': 100, 'storage_limit_bytes': 20 * 1024 * 1024 * 1024},  # 20GB
    }

    user = models.OneToOneField(
        'User',
        on_delete=models.CASCADE,
        related_name='quota',
        verbose_name='사용자'
    )
    plan_type = models.CharField(
        max_length=20,
        choices=PlanType.choices,
        default=PlanType.FREE,
        verbose_name='플랜 유형'
    )

    # 일일 노트 생성 제한
    daily_note_limit = models.PositiveIntegerField(
        default=20,
        verbose_name='일일 노트 생성 제한'
    )
    daily_notes_created = models.PositiveIntegerField(
        default=0,
        verbose_name='오늘 생성한 노트 수'
    )
    daily_reset_date = models.DateField(
        auto_now_add=True,
        verbose_name='일일 카운터 리셋 날짜'
    )

    # 스토리지 제한
    storage_limit_bytes = models.BigIntegerField(
        default=1073741824,  # 1GB
        verbose_name='스토리지 제한 (바이트)'
    )
    storage_used_bytes = models.BigIntegerField(
        default=0,
        verbose_name='사용 중인 스토리지 (바이트)'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = '사용자 쿼터'
        verbose_name_plural = '사용자 쿼터'

    def __str__(self):
        return f"{self.user.username} - {self.plan_type} ({self.storage_used_bytes / 1024 / 1024:.1f}MB / {self.storage_limit_bytes / 1024 / 1024:.0f}MB)"

    def check_daily_reset(self) -> bool:
        """자정이 지났으면 일일 카운터 리셋 (KST 기준). 리셋 여부 반환."""
        # 명시적 KST 타임존으로 오늘 날짜 계산
        kst_now = timezone.now().astimezone(KST)
        today_kst = kst_now.date()

        if self.daily_reset_date < today_kst:
            self.daily_notes_created = 0
            self.daily_reset_date = today_kst
            self.save(update_fields=['daily_notes_created', 'daily_reset_date', 'updated_at'])
            return True
        return False

    def can_create_note(self) -> tuple[bool, str]:
        """노트 생성 가능 여부 확인. (가능 여부, 에러 메시지) 반환."""
        self.check_daily_reset()
        if self.daily_notes_created >= self.daily_note_limit:
            return False, f"일일 노트 생성 제한({self.daily_note_limit}회)에 도달했습니다. 내일 다시 시도해주세요."
        return True, ""

    def can_upload_file(self, file_size: int) -> tuple[bool, str]:
        """파일 업로드 가능 여부 확인. (가능 여부, 에러 메시지) 반환."""
        if self.storage_used_bytes + file_size > self.storage_limit_bytes:
            remaining_mb = max(0, (self.storage_limit_bytes - self.storage_used_bytes)) / 1024 / 1024
            limit_mb = self.storage_limit_bytes / 1024 / 1024
            return False, f"스토리지 용량이 부족합니다. 남은 용량: {remaining_mb:.1f}MB / {limit_mb:.0f}MB"
        return True, ""

    def record_note_created(self, file_size: int) -> None:
        """노트 생성 기록. 원자적 업데이트로 동시성 문제 방지."""
        UserQuota.objects.filter(pk=self.pk).update(
            daily_notes_created=F('daily_notes_created') + 1,
            storage_used_bytes=F('storage_used_bytes') + file_size,
            updated_at=timezone.now()
        )
        # 로컬 인스턴스도 업데이트
        self.daily_notes_created += 1
        self.storage_used_bytes += file_size

    def record_file_deleted(self, file_size: int) -> None:
        """파일 삭제 기록. 원자적 업데이트로 동시성 문제 방지."""
        from django.db.models.functions import Greatest
        UserQuota.objects.filter(pk=self.pk).update(
            storage_used_bytes=Greatest(F('storage_used_bytes') - file_size, 0),
            updated_at=timezone.now()
        )
        # 로컬 인스턴스도 업데이트
        self.storage_used_bytes = max(0, self.storage_used_bytes - file_size)

    def get_storage_usage_percent(self) -> float:
        """스토리지 사용률(%) 반환."""
        if self.storage_limit_bytes == 0:
            return 0.0
        return round(self.storage_used_bytes / self.storage_limit_bytes * 100, 1)

    def get_daily_remaining(self) -> int:
        """오늘 남은 노트 생성 횟수 반환."""
        self.check_daily_reset()
        return max(0, self.daily_note_limit - self.daily_notes_created)

    @classmethod
    def get_or_create_for_user(cls, user) -> 'UserQuota':
        """사용자의 쿼터를 가져오거나 생성."""
        quota, created = cls.objects.get_or_create(user=user)
        return quota

class AccountLinkingToken(models.Model):
    """
    계정 연결/병합 워크플로우를 위한 보안 토큰
    소셜 계정 연결, 계정 병합 등의 작업에 사용
    """
    LINK_TYPE_CHOICES = [
        ('link_social', '소셜 계정 연결'),
        ('merge_accounts', '계정 병합'),
        ('set_password', '비밀번호 설정'),
        ('connect_init', '소셜 연결 초기화'),  # OAuth 시작 전 임시 토큰
    ]

    STATUS_CHOICES = [
        ('pending', '대기 중'),
        ('email_verification', '이메일 인증 대기'),  # 이메일 인증 대기 상태 추가
        ('completed', '완료'),
        ('expired', '만료'),
        ('cancelled', '취소'),
    ]

    # 대상 사용자 (연결될 계정)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='linking_tokens',
        verbose_name='대상 사용자'
    )

    token = models.UUIDField(default=uuid.uuid4, unique=True)
    link_type = models.CharField(
        max_length=20,
        choices=LINK_TYPE_CHOICES,
        verbose_name='연결 유형'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        verbose_name='상태'
    )

    # 연결할 소셜 계정 정보 (임시 저장)
    provider = models.CharField(max_length=20, verbose_name='소셜 제공자')
    social_id = models.CharField(max_length=255, verbose_name='소셜 ID')
    social_email = models.EmailField(blank=True, null=True, verbose_name='소셜 이메일')
    social_name = models.CharField(max_length=255, blank=True, null=True, verbose_name='소셜 이름')

    # 이메일 인증 관련 필드 (소셜 로그인 시 이메일 입력 후 인증용)
    pending_email = models.EmailField(
        blank=True,
        null=True,
        verbose_name='인증 대기 이메일',
        help_text='소셜 로그인 시 사용자가 입력한 이메일 (인증 대기 중)'
    )
    email_verification_token = models.UUIDField(
        null=True,
        blank=True,
        unique=True,
        verbose_name='이메일 인증 토큰'
    )
    email_verification_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='인증 이메일 발송 시간'
    )

    # 계정 병합 시나리오용 - 병합될 소스 계정
    source_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='merge_source_tokens',
        verbose_name='소스 사용자 (병합용)'
    )

    # 보안 및 메타데이터
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(verbose_name='만료 시간')
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name='완료 시간')
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name='IP 주소')

    class Meta:
        verbose_name = '계정 연결 토큰'
        verbose_name_plural = '계정 연결 토큰'
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['user', 'status']),
            models.Index(fields=['expires_at']),
            models.Index(fields=['email_verification_token']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.get_link_type_display()} - {self.provider}"

    def is_valid(self) -> bool:
        """토큰 유효성 확인"""
        return self.status in ('pending', 'email_verification') and timezone.now() <= self.expires_at

    def is_email_verification_valid(self) -> bool:
        """이메일 인증 대기 상태 유효성 확인"""
        return (
            self.status == 'email_verification' and
            self.pending_email and
            self.email_verification_token and
            timezone.now() <= self.expires_at
        )

    def can_resend_verification_email(self) -> tuple[bool, str]:
        """인증 이메일 재전송 가능 여부 확인 (60초 쿨다운)"""
        if not self.is_email_verification_valid():
            return False, "유효하지 않은 인증 상태입니다."

        if self.email_verification_sent_at:
            cooldown_seconds = 60
            elapsed = (timezone.now() - self.email_verification_sent_at).total_seconds()
            if elapsed < cooldown_seconds:
                remaining = int(cooldown_seconds - elapsed)
                return False, f"{remaining}초 후에 재전송 가능합니다."

        return True, ""

    def start_email_verification(self, email: str) -> None:
        """이메일 인증 프로세스 시작"""
        self.pending_email = email
        self.email_verification_token = uuid.uuid4()
        self.email_verification_sent_at = timezone.now()
        self.status = 'email_verification'
        self.save(update_fields=[
            'pending_email',
            'email_verification_token',
            'email_verification_sent_at',
            'status'
        ])

    def complete_email_verification(self) -> bool:
        """
        이메일 인증 완료 처리

        Returns:
            bool: 성공 여부 (이메일 중복시 False)
        """
        if self.pending_email:
            # 이메일 중복 확인 (1차: 애플리케이션 레벨)
            if User.objects.filter(email=self.pending_email).exclude(id=self.user_id).exists():
                return False

            try:
                self.user.email = self.pending_email
                self.user.email_verified = True
                self.user.email_verified_at = timezone.now()
                self.user.save(update_fields=['email', 'email_verified', 'email_verified_at'])
            except IntegrityError:
                # 2차: DB unique 제약 위반 (경합 조건 발생 시)
                return False

        self.status = 'completed'
        self.completed_at = timezone.now()
        self.save(update_fields=['status', 'completed_at'])
        return True

    def complete(self):
        """토큰 완료 처리"""
        self.status = 'completed'
        self.completed_at = timezone.now()
        self.save(update_fields=['status', 'completed_at'])

    def expire(self):
        """토큰 만료 처리"""
        self.status = 'expired'
        self.save(update_fields=['status'])

    def check_and_expire(self, exclude_completed: bool = False) -> bool:
        """
        토큰 만료 여부 확인 및 자동 만료 처리

        Args:
            exclude_completed: True이면 completed/expired 상태는 만료 처리 제외

        Returns:
            True이면 만료됨 (또는 만료 처리됨), False이면 유효함
        """
        if timezone.now() <= self.expires_at:
            return False

        # 이미 완료/만료된 상태면 상태 변경 없이 만료 여부만 반환
        if exclude_completed and self.status in ('completed', 'expired'):
            return True

        # 상태가 아직 변경되지 않았으면 만료 처리
        if self.status not in ('completed', 'expired'):
            self.status = 'expired'
            self.save(update_fields=['status'])

        return True

    def cancel(self):
        """토큰 취소 처리"""
        self.status = 'cancelled'
        self.save(update_fields=['status'])

    @classmethod
    def create_for_social_link(
        cls,
        user: User,
        provider: str,
        social_id: str,
        social_email: str = None,
        social_name: str = None,
        ip_address: str = None,
        expires_hours: int = 1
    ) -> 'AccountLinkingToken':
        """소셜 계정 연결을 위한 토큰 생성"""
        return cls.objects.create(
            user=user,
            link_type='link_social',
            provider=provider,
            social_id=social_id,
            social_email=social_email,
            social_name=social_name,
            ip_address=ip_address,
            expires_at=timezone.now() + timezone.timedelta(hours=expires_hours)
        )

    @classmethod
    def create_for_merge(
        cls,
        target_user: User,
        source_user: User,
        provider: str,
        social_id: str,
        ip_address: str = None,
        expires_hours: int = 1
    ) -> 'AccountLinkingToken':
        """계정 병합을 위한 토큰 생성"""
        return cls.objects.create(
            user=target_user,
            source_user=source_user,
            link_type='merge_accounts',
            provider=provider,
            social_id=social_id,
            ip_address=ip_address,
            expires_at=timezone.now() + timezone.timedelta(hours=expires_hours)
        )

    @classmethod
    def cleanup_expired(cls) -> int:
        """만료된 토큰 정리 (배치 작업용)"""
        expired_tokens = cls.objects.filter(
            status='pending',
            expires_at__lt=timezone.now()
        )
        count = expired_tokens.count()
        expired_tokens.update(status='expired')
        return count
