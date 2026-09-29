from dj_rest_auth.registration.serializers import RegisterSerializer
from dj_rest_auth.serializers import LoginSerializer as RestAuthLoginSerializer
from rest_framework import serializers
from django.utils.translation import gettext_lazy as _
from django.contrib.auth import get_user_model, authenticate
from django.conf import settings
from .utils import (
    get_client_ip, check_login_attempts, record_failed_login, clear_login_attempts,
    check_registration_attempts, record_failed_registration, clear_registration_attempts
)
# from .models import EmailVerification  # 지연 import로 변경

User = get_user_model()


class CustomLoginSerializer(RestAuthLoginSerializer):
    # 기본 username 필드를 제거하고, 아이디 또는 이메일을 받을 수 있는 'login' 필드를 추가합니다.
    username = None
    email = None
    login = serializers.CharField(
        label=_("Login"),
        write_only=True
    )

    def validate(self, attrs):
        login = attrs.get('login')
        password = attrs.get('password')
        request = self.context.get('request')
        
        if not request:
            raise serializers.ValidationError(_('Request context is required.'))
        
        # 클라이언트 IP 주소 가져오기
        client_ip = get_client_ip(request)
        
        # 브루트 포스 공격 방지 - 로그인 시도 횟수 체크
        if login:
            lockout_message = check_login_attempts(login, client_ip)
            if lockout_message:
                raise serializers.ValidationError(lockout_message, code='rate_limit')

        user_obj = None
        username_for_auth = None
        
        # 사용자 조회
        if '@' in login:
            try:
                user_obj = User.objects.get(email=login)
                username_for_auth = user_obj.username
            except User.DoesNotExist:
                username_for_auth = login  # 이메일이 존재하지 않을 경우 이메일을 사용자명으로 사용
        else:
            try:
                user_obj = User.objects.get(username=login)
                username_for_auth = login
            except User.DoesNotExist:
                username_for_auth = login

        # 사용자가 존재하고 이메일 인증이 완료되지 않은 경우
        if user_obj and not user_obj.is_active:
            msg = _('이메일 인증이 필요합니다. 회원가입 시 발송된 인증 이메일을 확인해주세요.')
            raise serializers.ValidationError(msg, code='email_verification_required')

        # Django의 authenticate 함수로 비밀번호 확인
        user = authenticate(username=username_for_auth, password=password)

        if not user:
            # 로그인 실패 시 시도 횟수 기록
            if login:
                user_attempts, ip_attempts = record_failed_login(username_for_auth, client_ip)
                
                # 남은 시도 횟수 계산
                max_attempts = getattr(settings, 'LOGIN_ATTEMPT_LIMIT', 5)
                lockout_minutes = getattr(settings, 'LOGIN_LOCKOUT_DURATION', 300) // 60
                remaining_attempts = max(0, max_attempts - user_attempts)
                
                if remaining_attempts > 0:
                    msg = _('아이디, 이메일 또는 비밀번호를 확인해주세요. 남은 시도 횟수: {}회').format(remaining_attempts)
                else:
                    msg = _('로그인 시도 횟수를 초과했습니다. {}분 후 다시 시도해주세요.').format(lockout_minutes)
            else:
                msg = _('아이디, 이메일 또는 비밀번호를 확인해주세요.')
            
            raise serializers.ValidationError(msg, code='authorization')

        # 로그인 성공 시 시도 횟수 초기화
        clear_login_attempts(username_for_auth, client_ip)
        
        attrs['user'] = user
        return attrs


class CustomRegisterSerializer(RegisterSerializer):
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    # 기본 필드를 오버라이드하여 오류 메시지를 커스터마이징합니다.
    username = serializers.CharField(
        max_length=150,
        help_text=_('Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.'),
        validators=[User._meta.get_field('username').validators[0]], # UniqueValidator
        error_messages={
            'unique': _("이미 사용 중인 아이디입니다."),
        },
    )
    email = serializers.EmailField(
        required=True,
        error_messages={
            'unique': _("이미 등록된 이메일입니다."),
        },
    )

    def validate(self, attrs):
        request = self.context.get('request')
        
        if request:
            # 클라이언트 IP 주소 가져오기
            client_ip = get_client_ip(request)
            
            # 브루트 포스 공격 방지 - 회원가입 시도 횟수 체크
            lockout_message = check_registration_attempts(client_ip)
            if lockout_message:
                raise serializers.ValidationError(lockout_message, code='rate_limit')
        
        # 필수 필드 검증을 순서대로 진행하여 첫 번째 오류만 반환
        username = attrs.get('username')
        email = attrs.get('email')
        password1 = attrs.get('password1')
        password2 = attrs.get('password2')

        # R4: 이메일을 소문자로 정규화한다. 정규화하지 않으면 Foo@x.com과 foo@x.com이
        # 별개 계정으로 저장돼 중복 가드가 우회되고, 소셜 어댑터의 소문자 비교와도
        # 불일치해 자동 연결이 실패한다. 정규화값을 이후 검증·저장(attrs)에 반영한다.
        if email:
            email = email.strip().lower()
            attrs['email'] = email

        # 가입 username에 '@'를 금지한다(프로필 PUT은 별도 검증). 로그인은 '@'
        # 포함 시 이메일로 먼저 조회하므로 이메일형 username이 로그인 조회를 교란한다.
        if username and '@' in username:
            raise serializers.ValidationError(_("아이디에는 '@'를 사용할 수 없습니다."))

        try:
            # 1. 사용자명 중복 검사
            if username and User.objects.filter(username=username).exists():
                raise serializers.ValidationError(_("이미 사용 중인 아이디입니다."))

            # 2. 이메일 중복 검사 (is_active 상태별 분기 처리)
            # - is_active=True : 정상 가입된 계정 → 차단
            # - is_active=False + 인증 유효(24h 이내) : 미인증 계정 존재 → 재발송 안내
            # - is_active=False + 인증 만료(24h 초과) : 방치된 미인증 계정 → 삭제 후 재가입 허용
            if email:
                active_user = User.objects.filter(email=email, is_active=True).first()
                if active_user:
                    raise serializers.ValidationError(_("이미 등록된 이메일입니다."))

                inactive_user = User.objects.filter(email=email, is_active=False).first()
                if inactive_user:
                    from .models import EmailVerification
                    try:
                        verification = EmailVerification.objects.get(user=inactive_user)
                        if verification.is_valid():
                            # 아직 유효한 인증 링크가 있음 → 재발송 안내
                            raise serializers.ValidationError(
                                _("이미 가입된 이메일입니다. 이메일로 발송된 인증 링크를 확인하거나 인증 이메일을 재전송해주세요.")
                            )
                        else:
                            # 인증 링크 만료 → 기존 미인증 계정 삭제 후 재가입 허용
                            inactive_user.delete()
                    except EmailVerification.DoesNotExist:
                        # EmailVerification 레코드가 없는 미인증 계정 → 삭제 후 재가입 허용
                        inactive_user.delete()

            # 3. 소셜 계정 이메일 중복 검사
            if email:
                from allauth.socialaccount.models import SocialAccount
                if SocialAccount.objects.filter(extra_data__email=email).exists():
                    raise serializers.ValidationError(_("이미 소셜 계정으로 연결된 이메일입니다. 해당 계정으로 로그인해주세요."))

            # 4. 비밀번호 일치 검사
            if password1 and password2 and password1 != password2:
                raise serializers.ValidationError(_("비밀번호가 일치하지 않습니다."))

            # 5. 비밀번호 복잡성 검사 (영문 + 숫자 + 특수문자)
            if password1:
                from .validators import validate_password_complexity
                try:
                    validate_password_complexity(password1)
                except Exception:
                    raise serializers.ValidationError(_("비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다."))

            # 부모 클래스의 나머지 검증 로직 실행
            result = super().validate(attrs)
            
            # 성공한 경우 시도 횟수 초기화
            if request:
                clear_registration_attempts(client_ip)
            
            return result
            
        except serializers.ValidationError as e:
            # 검증 실패 시 시도 횟수 기록
            if request:
                ip_attempts = record_failed_registration(client_ip)
                
                # 남은 시도 횟수 계산
                max_attempts = getattr(settings, 'REGISTRATION_ATTEMPT_LIMIT', 5)
                lockout_minutes = getattr(settings, 'REGISTRATION_LOCKOUT_DURATION', 300) // 60
                remaining_attempts = max(0, max_attempts - ip_attempts)
                
                if remaining_attempts > 0:
                    # 기존 오류 메시지에 남은 시도 횟수 추가
                    if hasattr(e, 'detail') and isinstance(e.detail, str):
                        error_msg = f"{e.detail} 남은 시도 횟수: {remaining_attempts}회"
                    else:
                        error_msg = f"회원가입에 실패했습니다. 남은 시도 횟수: {remaining_attempts}회"
                    raise serializers.ValidationError(error_msg)
                else:
                    raise serializers.ValidationError(f"회원가입 시도 횟수를 초과했습니다. {lockout_minutes}분 후 다시 시도해주세요.")
            
            # request가 없는 경우 원래 오류 그대로 발생
            raise e

    def get_cleaned_data(self):
        data = super().get_cleaned_data()
        data['first_name'] = self.validated_data.get('first_name', '')
        data['last_name'] = self.validated_data.get('last_name', '')
        return data
    
    def save(self, request):
        # 직접 사용자 생성 (allauth 기본 동작 건너뛰기)
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # 사용자 생성 (비활성화 상태)
        user = User.objects.create_user(
            username=self.validated_data['username'],
            email=self.validated_data['email'],
            password=self.validated_data['password1'],
            is_active=False,  # 이메일 인증 전까지 비활성화
            first_name=self.validated_data.get('first_name', ''),
            last_name=self.validated_data.get('last_name', '')
        )

        # 이메일 인증 토큰 생성 (지연 import)
        from .models import EmailVerification
        email_verification, created = EmailVerification.objects.get_or_create(user=user)

        # allauth EmailAddress 레코드 생성 (인증 대기 상태)
        # 소셜 로그인 연결 시 wipe_password() 방지를 위해 필요
        from allauth.account.models import EmailAddress
        EmailAddress.objects.get_or_create(
            user=user,
            email=user.email,
            defaults={'verified': False, 'primary': True}
        )

        # 인증 이메일 발송
        self.send_verification_email(request, user, email_verification.token)

        return user
    
    def send_verification_email(self, request, user, token):
        """
        이메일 인증 발송 함수
        """
        from django.urls import reverse
        from .utils.email import send_email_verification_email

        verification_path = reverse('verify-email', kwargs={'token': token})
        verification_link = f"{request.scheme}://{request.get_host()}{verification_path}"

        # 템플릿 기반(인라인 스타일) 발송으로 일관화
        send_email_verification_email(request, user, verification_link)


# ===== 소셜 계정 연결 관련 Serializers =====

class LinkedAccountSerializer(serializers.Serializer):
    """연결된 소셜 계정 정보 Serializer"""
    provider = serializers.CharField()
    provider_display = serializers.CharField(source='get_provider_display')
    social_email = serializers.EmailField(allow_null=True)
    social_name = serializers.CharField(allow_null=True)
    linked_at = serializers.DateTimeField()
    linked_by = serializers.CharField()
    linked_by_display = serializers.CharField(source='get_linked_by_display')
    last_used_at = serializers.DateTimeField(allow_null=True)
    access_count = serializers.IntegerField()
    can_unlink = serializers.SerializerMethodField()
    unlink_error = serializers.SerializerMethodField()

    def get_can_unlink(self, obj):
        can_unlink, _ = obj.user.can_unlink_provider(obj.provider)
        return can_unlink

    def get_unlink_error(self, obj):
        can_unlink, error_msg = obj.user.can_unlink_provider(obj.provider)
        return error_msg if not can_unlink else None


class AvailableProviderSerializer(serializers.Serializer):
    """연결 가능한 소셜 제공자 정보 Serializer"""
    name = serializers.CharField()
    display = serializers.CharField()
    is_linked = serializers.BooleanField()


class UserProfileSerializer(serializers.ModelSerializer):
    """사용자 프로필 정보 Serializer (확장)"""
    linked_providers = serializers.SerializerMethodField()
    linked_providers_count = serializers.SerializerMethodField()

    has_usable_password = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'pk', 'username', 'email', 'first_name', 'last_name',
            'is_active', 'date_joined', 'last_login',
            'has_usable_password', 'is_social_user', 'primary_auth_method',
            'email_verified', 'linked_providers', 'linked_providers_count'
        ]
        read_only_fields = fields

    def get_has_usable_password(self, obj):
        return obj.has_usable_password()

    def get_linked_providers(self, obj):
        return obj.get_linked_providers()

    def get_linked_providers_count(self, obj):
        return obj.get_linked_accounts_count()


class UnlinkSocialAccountRequestSerializer(serializers.Serializer):
    """소셜 계정 연결 해제 요청 Serializer"""
    password = serializers.CharField(
        required=False,
        write_only=True,
        allow_blank=True,
        help_text='비밀번호가 있는 사용자의 경우 필수'
    )

    def validate(self, attrs):
        user = self.context.get('user')
        provider = self.context.get('provider')

        if not user:
            raise serializers.ValidationError('사용자 정보가 필요합니다.')

        # 연결 해제 가능 여부 확인
        can_unlink, error_msg = user.can_unlink_provider(provider)
        if not can_unlink:
            raise serializers.ValidationError(error_msg)

        # 비밀번호 검증 (비밀번호가 있는 경우)
        if user.has_usable_password():
            password = attrs.get('password')
            if not password:
                raise serializers.ValidationError({'password': '비밀번호 검증이 필요합니다.'})
            if not user.check_password(password):
                raise serializers.ValidationError({'password': '비밀번호가 올바르지 않습니다.'})

        return attrs


class SetPasswordSerializer(serializers.Serializer):
    """비밀번호 설정 Serializer (소셜 전용 사용자용)"""
    new_password = serializers.CharField(
        min_length=8,
        write_only=True,
        help_text='최소 8자 이상'
    )
    confirm_password = serializers.CharField(
        write_only=True
    )
    social_verification_token = serializers.UUIDField(
        required=False,
        help_text='소셜 재인증 후 발급된 토큰 (소셜 전용 사용자의 경우 필수)'
    )

    def validate(self, attrs):
        user = self.context.get('user')

        if not user:
            raise serializers.ValidationError('사용자 정보가 필요합니다.')

        # 이미 비밀번호가 있는 경우
        if user.has_usable_password():
            raise serializers.ValidationError('이미 비밀번호가 설정되어 있습니다. 비밀번호 변경 기능을 사용하세요.')

        # 비밀번호 일치 확인
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': '비밀번호가 일치하지 않습니다.'})

        # 비밀번호 복잡성 검증 (영문 + 숫자 + 특수문자)
        from .validators import validate_password_complexity, PASSWORD_COMPLEXITY_ERROR_MESSAGE
        try:
            validate_password_complexity(attrs['new_password'])
        except Exception:
            raise serializers.ValidationError({'new_password': PASSWORD_COMPLEXITY_ERROR_MESSAGE})

        # 소셜 인증 토큰 검증 (소셜 전용 사용자의 경우) - 선택적
        # 사용자가 이미 로그인된 상태이므로 토큰 없이도 비밀번호 설정 허용
        # 토큰이 제공된 경우에만 View에서 추가 검증

        return attrs


class MergeAccountsSerializer(serializers.Serializer):
    """계정 병합 요청 Serializer"""
    # 병합 토큰은 HttpOnly 쿠키(merge_token)로 전달되며 뷰가 쿠키에서 읽는다.
    # 바디로는 받지 않으므로 선택 필드로 둔다.
    merge_token = serializers.UUIDField(
        required=False,
    )
    target_password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        help_text='대상 계정의 비밀번호 (비밀번호가 있는 경우 필수)'
    )
    confirm_merge = serializers.BooleanField(
        help_text='병합 확인 (true로 설정해야 병합 진행)'
    )

    def validate_confirm_merge(self, value):
        if not value:
            raise serializers.ValidationError('병합을 진행하려면 확인이 필요합니다.')
        return value