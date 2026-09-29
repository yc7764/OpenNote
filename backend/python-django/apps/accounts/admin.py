from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.html import format_html
from allauth.socialaccount.models import SocialAccount
from .models import User, EmailVerification, SocialAccountMetadata, SocialVerificationToken, UserQuota, AccountLinkingToken

# 커스텀 User 모델 관리자 설정
@admin.register(User)
class CustomUserAdmin(UserAdmin):
    # 목록 페이지에서 표시할 필드들
    list_display = (
        'username', 'email', 'first_name', 'last_name',
        'is_active', 'is_staff', 'is_social_user',
        'linked_accounts_count', 'primary_auth_method', 'date_joined'
    )

    # 필터 옵션
    list_filter = ('is_active', 'is_staff', 'is_superuser', 'is_social_user', 'primary_auth_method', 'date_joined')

    # 검색 필드
    search_fields = ('username', 'email', 'first_name', 'last_name')

    # 상세 페이지에서 편집할 필드들
    fieldsets = UserAdmin.fieldsets + (
        ('추가 정보', {'fields': ('name', 'is_social_user')}),
        ('Master Account 정보', {
            'fields': ('primary_auth_method', 'email_verified', 'created_via'),
            'classes': ('collapse',)
        }),
    )

    # 사용자 추가 페이지에서 보여줄 필드들
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('추가 정보', {'fields': ('email', 'first_name', 'last_name', 'name')}),
    )

    # 목록에서 편집 가능한 필드들
    list_editable = ('is_active', 'is_social_user')

    # 읽기 전용 필드
    readonly_fields = ('date_joined', 'last_login')

    # 페이지당 표시할 항목 수
    list_per_page = 25

    # 커스텀 메서드 - 연결된 소셜 계정 수 (allauth SocialAccount 사용)
    def linked_accounts_count(self, obj):
        count = SocialAccount.objects.filter(user=obj).count()
        if count > 0:
            return format_html('<span style="color: green;">{}</span>', count)
        return count
    linked_accounts_count.short_description = '연결된 계정'

# 이메일 인증 모델 관리자 설정
@admin.register(EmailVerification)
class EmailVerificationAdmin(admin.ModelAdmin):
    # 목록 페이지에서 표시할 필드들
    list_display = ('user', 'token', 'created_at', 'is_verified', 'is_valid_token')
    
    # 필터 옵션
    list_filter = ('is_verified', 'created_at')
    
    # 검색 필드
    search_fields = ('user__username', 'user__email', 'token')
    
    # 읽기 전용 필드
    readonly_fields = ('token', 'created_at')
    
    # 목록에서 편집 가능한 필드들
    list_editable = ('is_verified',)
    
    # 날짜 기준 정렬
    ordering = ('-created_at',)
    
    # 페이지당 표시할 항목 수
    list_per_page = 25
    
    # 커스텀 메서드 - 토큰 유효성 표시
    def is_valid_token(self, obj):
        return obj.is_valid()
    is_valid_token.boolean = True
    is_valid_token.short_description = '토큰 유효성'
    
    # 사용자 정보 표시
    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.select_related('user')


# 소셜 계정 메타데이터 모델 관리자 설정 (allauth SocialAccount 확장)
@admin.register(SocialAccountMetadata)
class SocialAccountMetadataAdmin(admin.ModelAdmin):
    # 목록 페이지에서 표시할 필드들
    list_display = (
        'get_user', 'get_provider', 'linked_by_display',
        'access_count', 'last_used_at', 'created_at'
    )

    # 필터 옵션
    list_filter = ('linked_by', 'created_at')

    # 검색 필드
    search_fields = (
        'social_account__user__username',
        'social_account__user__email',
        'social_account__provider'
    )

    # 읽기 전용 필드
    readonly_fields = ('created_at', 'updated_at', 'access_count', 'last_used_at')

    # 상세 페이지 필드 그룹
    fieldsets = (
        ('소셜 계정', {'fields': ('social_account',)}),
        ('연결 정보', {
            'fields': ('linked_by', 'access_count', 'last_used_at'),
        }),
        ('시간 정보', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    # 날짜 기준 정렬
    ordering = ('-created_at',)

    # 페이지당 표시할 항목 수
    list_per_page = 25

    # 사용자 정보 표시
    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.select_related('social_account', 'social_account__user')

    # 커스텀 메서드 - 사용자 표시
    def get_user(self, obj):
        return obj.social_account.user.username
    get_user.short_description = '사용자'
    get_user.admin_order_field = 'social_account__user__username'

    # 커스텀 메서드 - 프로바이더 표시
    def get_provider(self, obj):
        return obj.social_account.provider
    get_provider.short_description = '프로바이더'
    get_provider.admin_order_field = 'social_account__provider'

    # 커스텀 메서드 - 연결 방법 표시
    def linked_by_display(self, obj):
        colors = {
            'registration': '#28a745',  # 초록 - 계정 생성 시
            'auto_email': '#007bff',    # 파랑 - 이메일 자동 연결
            'manual': '#6f42c1',        # 보라 - 수동 연결
        }
        color = colors.get(obj.linked_by, '#6c757d')
        labels = {
            'registration': '가입',
            'auto_email': '자동',
            'manual': '수동',
        }
        label = labels.get(obj.linked_by, obj.linked_by)
        return format_html('<span style="color: {};">{}</span>', color, label)
    linked_by_display.short_description = '연결 방법'
    linked_by_display.admin_order_field = 'linked_by'


# 소셜 인증 토큰 모델 관리자 설정
@admin.register(SocialVerificationToken)
class SocialVerificationTokenAdmin(admin.ModelAdmin):
    # 목록 페이지에서 표시할 필드들
    list_display = ('user', 'provider', 'social_email', 'created_at', 'expires_at', 'is_used', 'is_valid_token')

    # 필터 옵션
    list_filter = ('provider', 'is_used', 'created_at')

    # 검색 필드
    search_fields = ('user__username', 'social_email', 'token')

    # 읽기 전용 필드
    readonly_fields = ('token', 'created_at')

    # 목록에서 편집 가능한 필드들
    list_editable = ('is_used',)

    # 날짜 기준 정렬
    ordering = ('-created_at',)

    # 페이지당 표시할 항목 수
    list_per_page = 25

    # 커스텀 메서드 - 토큰 유효성 표시
    def is_valid_token(self, obj):
        return obj.is_valid()
    is_valid_token.boolean = True
    is_valid_token.short_description = '토큰 유효성'

    # 사용자 정보 표시
    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.select_related('user')


# 사용자 쿼터 모델 관리자 설정
@admin.register(UserQuota)
class UserQuotaAdmin(admin.ModelAdmin):
    # 목록 페이지에서 표시할 필드들
    list_display = (
        'user', 'plan_type', 'daily_notes_created', 'daily_note_limit',
        'storage_used_display', 'storage_limit_display', 'storage_usage_bar', 'updated_at'
    )

    # 필터 옵션
    list_filter = ('plan_type', 'created_at')

    # 검색 필드
    search_fields = ('user__username', 'user__email')

    # 읽기 전용 필드 (사용량은 시스템에서 자동 관리)
    readonly_fields = ('storage_used_bytes', 'daily_notes_created', 'daily_reset_date', 'created_at', 'updated_at')

    # 상세 페이지 필드 그룹
    fieldsets = (
        ('사용자', {'fields': ('user',)}),
        ('플랜 설정', {'fields': ('plan_type', 'daily_note_limit', 'storage_limit_bytes')}),
        ('사용량 (자동 관리)', {
            'fields': ('daily_notes_created', 'daily_reset_date', 'storage_used_bytes'),
            'classes': ('collapse',)
        }),
        ('시간 정보', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    # 날짜 기준 정렬
    ordering = ('-updated_at',)

    # 페이지당 표시할 항목 수
    list_per_page = 25

    # 사용자 정보 표시
    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.select_related('user')

    # 커스텀 메서드 - 스토리지 사용량 표시 (MB 단위)
    def storage_used_display(self, obj):
        mb = obj.storage_used_bytes / 1024 / 1024
        if mb >= 1024:
            return f'{mb / 1024:.2f} GB'
        return f'{mb:.1f} MB'
    storage_used_display.short_description = '사용량'
    storage_used_display.admin_order_field = 'storage_used_bytes'

    # 커스텀 메서드 - 스토리지 제한 표시 (GB 단위)
    def storage_limit_display(self, obj):
        gb = obj.storage_limit_bytes / 1024 / 1024 / 1024
        return f'{gb:.1f} GB'
    storage_limit_display.short_description = '제한'
    storage_limit_display.admin_order_field = 'storage_limit_bytes'

    # 커스텀 메서드 - 스토리지 사용률 진행 바
    def storage_usage_bar(self, obj):
        percent = obj.get_storage_usage_percent()
        if percent >= 90:
            color = '#dc3545'  # 빨강
        elif percent >= 70:
            color = '#ffc107'  # 노랑
        else:
            color = '#28a745'  # 초록
        return format_html(
            '<div style="width:100px; background-color:#ddd; border-radius:3px;">'
            '<div style="width:{}%; background-color:{}; height:12px; border-radius:3px;"></div>'
            '</div> {}%',
            min(percent, 100), color, percent
        )
    storage_usage_bar.short_description = '사용률'


# 계정 연결 토큰 모델 관리자 설정
@admin.register(AccountLinkingToken)
class AccountLinkingTokenAdmin(admin.ModelAdmin):
    # 목록 페이지에서 표시할 필드들
    list_display = (
        'user', 'link_type', 'provider', 'status_display',
        'is_valid_token', 'created_at', 'expires_at'
    )

    # 필터 옵션
    list_filter = ('link_type', 'status', 'provider', 'created_at')

    # 검색 필드
    search_fields = ('user__username', 'user__email', 'token', 'source_user__username')

    # 읽기 전용 필드
    readonly_fields = ('token', 'created_at', 'completed_at')

    # 상세 페이지 필드 그룹
    fieldsets = (
        ('기본 정보', {'fields': ('user', 'token', 'link_type')}),
        ('연결 대상', {'fields': ('provider', 'social_id', 'social_email', 'social_name', 'source_user')}),
        ('상태', {'fields': ('status', 'expires_at', 'completed_at')}),
        ('시간 정보', {
            'fields': ('created_at', 'ip_address'),
            'classes': ('collapse',)
        }),
    )

    # 날짜 기준 정렬
    ordering = ('-created_at',)

    # 페이지당 표시할 항목 수
    list_per_page = 25

    # 사용자 정보 표시
    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.select_related('user', 'source_user')

    # 커스텀 메서드 - 상태 표시
    def status_display(self, obj):
        colors = {
            'pending': '#ffc107',    # 노랑
            'completed': '#28a745',  # 초록
            'expired': '#dc3545',    # 빨강
            'cancelled': '#6c757d',  # 회색
        }
        color = colors.get(obj.status, '#6c757d')
        labels = {
            'pending': '대기 중',
            'completed': '완료',
            'expired': '만료',
            'cancelled': '취소',
        }
        label = labels.get(obj.status, obj.status)
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, label)
    status_display.short_description = '상태'
    status_display.admin_order_field = 'status'

    # 커스텀 메서드 - 토큰 유효성 표시
    def is_valid_token(self, obj):
        return obj.is_valid()
    is_valid_token.boolean = True
    is_valid_token.short_description = '유효성'

    # Admin actions
    actions = ['mark_as_expired', 'mark_as_cancelled']

    @admin.action(description='선택한 토큰을 만료 처리')
    def mark_as_expired(self, request, queryset):
        updated = queryset.filter(status='pending').update(status='expired')
        self.message_user(request, f'{updated}개의 토큰이 만료 처리되었습니다.')

    @admin.action(description='선택한 토큰을 취소 처리')
    def mark_as_cancelled(self, request, queryset):
        updated = queryset.filter(status='pending').update(status='cancelled')
        self.message_user(request, f'{updated}개의 토큰이 취소 처리되었습니다.')
