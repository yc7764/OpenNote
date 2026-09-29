"""
커스텀 Allauth 어댑터

소셜 로그인 시 추가 처리를 담당합니다:
- 사용자 생성 시 커스텀 필드 설정
- 로그인 시 메타데이터 업데이트 (access_count, last_used_at)
- 계정 연결 후 리다이렉트 URL 제공
"""
from django.conf import settings
from django.db.models import F
from django.utils import timezone
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    """
    커스텀 소셜 계정 어댑터

    소셜 로그인/회원가입 시 추가 처리를 담당합니다.
    """

    # 네이버가 직접 발급·소유하는 메일 도메인
    NAVER_OWNED_DOMAINS = ('@naver.com',)

    def populate_user(self, request, sociallogin, data):
        """
        소셜 로그인 사용자 인스턴스를 채울 때(저장 전) 호출.

        - M3: 이메일 없는 소셜 가입은 allauth가 email=''로 채우는데, User.email이
          unique=True라 Postgres에서 ''='' 충돌로 2번째 무이메일 가입부터
          IntegrityError가 난다. 빈 문자열을 NULL로 정규화해(null=True) 여러
          무이메일 계정이 공존하게 한다.
        - R4: 이메일을 소문자로 정규화해 authenticate_by_email(소문자 비교)·중복
          가드와 표기가 일치하도록 한다.
        """
        user = super().populate_user(request, sociallogin, data)
        email = (getattr(user, 'email', None) or '').strip().lower()
        user.email = email or None
        return user

    def save_user(self, request, sociallogin, form=None):
        """
        소셜 로그인으로 새 사용자 생성 시 호출

        User 모델의 커스텀 필드를 설정합니다.
        - is_social_user, primary_auth_method, created_via
        - name, first_name, last_name (이름 자동 설정)
        """
        from .services.helpers import generate_display_name, split_name

        user = super().save_user(request, sociallogin, form)

        # 커스텀 필드 설정
        user.is_social_user = True

        # 최초 인증 방법 및 생성 경로 기록
        provider = sociallogin.account.provider
        uid = sociallogin.account.uid
        extra_data = sociallogin.account.extra_data

        user.primary_auth_method = provider
        user.created_via = f'social_{provider}'

        # 이름 자동 설정
        social_name = self._extract_name_from_extra_data(provider, extra_data)
        if not social_name:
            social_name = generate_display_name(provider, uid, extra_data)

        # 이름 필드 설정
        user.name = social_name[:255] if social_name else ''
        first_name, last_name = split_name(social_name)
        user.first_name = first_name
        user.last_name = last_name

        # 소셜 계정 이메일을 User.email에 저장 (아직 없는 경우만)
        social_email = self._extract_email_from_extra_data(provider, extra_data)
        email_updated = False
        if social_email and not user.email:
            user.email = social_email
            email_updated = True

        # 프로바이더가 소유권을 보증한 주소만 인증 완료로 기록한다.
        # 네이버는 검증 필드를 제공하지 않고, 나머지 프로바이더도 미인증
        # 주소를 내려줄 수 있으므로 무조건 True로 두면 사실과 어긋난다.
        user.email_verified = self._is_verified_social_email(sociallogin, user.email)
        user.email_verified_at = timezone.now() if user.email_verified else None

        update_fields = [
            'is_social_user',
            'primary_auth_method',
            'created_via',
            'name',
            'first_name',
            'last_name',
            'email_verified',
            'email_verified_at',
        ]
        if email_updated:
            update_fields.append('email')

        user.save(update_fields=update_fields)

        # SocialAccountMetadata 생성
        self._create_metadata(sociallogin.account, linked_by='registration')

        # 샘플 노트 생성
        from apps.notes.sample_note import create_sample_note_if_needed
        create_sample_note_if_needed(user)

        return user

    def _extract_name_from_extra_data(self, provider: str, extra_data: dict) -> str:
        """
        프로바이더별 extra_data에서 이름 추출

        Args:
            provider: 소셜 프로바이더 (github, google, naver, kakao)
            extra_data: 소셜 서비스 응답 데이터

        Returns:
            추출된 이름 또는 빈 문자열
        """
        if not extra_data:
            return ''

        if provider == 'kakao':
            # Kakao: kakao_account.profile.nickname 또는 properties.nickname
            kakao_account = extra_data.get('kakao_account', {})
            profile = kakao_account.get('profile', {}) if isinstance(kakao_account, dict) else {}
            name = profile.get('nickname', '') if isinstance(profile, dict) else ''
            if not name:
                props = extra_data.get('properties', {})
                name = props.get('nickname', '') if isinstance(props, dict) else ''
            return name

        elif provider == 'naver':
            # Naver: response.name 또는 response.nickname
            naver_response = extra_data.get('response', extra_data)
            if isinstance(naver_response, dict):
                return naver_response.get('name', '') or naver_response.get('nickname', '')
            return ''

        elif provider in ('google', 'google-oauth2'):
            # Google: name 또는 given_name + family_name
            name = extra_data.get('name', '')
            if not name:
                given = extra_data.get('given_name', '')
                family = extra_data.get('family_name', '')
                name = f"{given} {family}".strip()
            return name

        elif provider == 'github':
            # GitHub: name 또는 login
            return extra_data.get('name', '') or extra_data.get('login', '')

        else:
            return extra_data.get('name', '')

    def _extract_email_from_extra_data(self, provider: str, extra_data: dict) -> str:
        """
        프로바이더별 extra_data에서 이메일 추출

        Args:
            provider: 소셜 프로바이더 (github, google, naver, kakao)
            extra_data: 소셜 서비스 응답 데이터

        Returns:
            추출된 이메일 또는 빈 문자열
        """
        if not extra_data:
            return ''

        if provider == 'kakao':
            # Kakao: kakao_account.email
            kakao_account = extra_data.get('kakao_account', {})
            if isinstance(kakao_account, dict):
                return kakao_account.get('email', '') or ''
            return ''

        elif provider == 'naver':
            # Naver: response.email
            naver_response = extra_data.get('response', extra_data)
            if isinstance(naver_response, dict):
                return naver_response.get('email', '') or ''
            return ''

        elif provider in ('google', 'google-oauth2'):
            # Google: email
            return extra_data.get('email', '') or ''

        elif provider == 'github':
            # GitHub: email
            return extra_data.get('email', '') or ''

        else:
            return extra_data.get('email', '') or ''

    def _is_trustworthy_email(self, provider: str, email_address) -> bool:
        """
        프로바이더가 이 이메일 주소의 소유권을 보증하는지 판단

        네이버 프로필 API에는 이메일 인증 여부 필드가 없어 allauth가 모든
        주소를 verified=True로 표시한다. 네이버 문서상 기본값은
        '네이버ID@naver.com'이고 사용자가 외부메일로 변경할 수 있으므로,
        네이버가 발급한 도메인일 때만 소유권이 보장된다.

        Args:
            provider: 소셜 프로바이더 (github, google, naver, kakao)
            email_address: allauth EmailAddress 인스턴스

        Returns:
            자동 연결에 사용해도 되는 주소면 True
        """
        if provider == 'naver':
            return email_address.email.lower().endswith(self.NAVER_OWNED_DOMAINS)
        return email_address.verified

    def _is_verified_social_email(self, sociallogin, email: str) -> bool:
        """
        소셜 응답이 이 주소를 소유권 보증된 것으로 표시했는지 확인

        Args:
            sociallogin: allauth SocialLogin 인스턴스
            email: 확인할 이메일 주소

        Returns:
            프로바이더가 소유권을 보증한 주소면 True
        """
        if not email:
            return False

        provider = sociallogin.account.provider
        target = email.lower()
        for email_address in sociallogin.email_addresses:
            if email_address.email.lower() == target:
                return self._is_trustworthy_email(provider, email_address)
        return False

    def authenticate_by_email(self, sociallogin):
        """
        이메일로 기존 사용자를 찾는다 (allauth 기본 구현 대체)

        SocialLogin.lookup()이 pre_social_login보다 먼저 호출되므로, 자동 연결
        차단은 반드시 이 지점에서 해야 한다. 기본 구현과 두 가지가 다르다.

        - 소유권이 보증된 주소만 사용 (_is_trustworthy_email)
        - 비활성 사용자(병합된 계정) 제외 — 기본 구현은 is_active를 보지 않는다

        Returns:
            (user, email) 튜플, 매칭 없으면 None
        """
        from django.contrib.auth import get_user_model

        User = get_user_model()
        provider = sociallogin.account.provider

        for email_address in sociallogin.email_addresses:
            if not self._is_trustworthy_email(provider, email_address):
                continue
            user = User.objects.filter(
                email=email_address.email, is_active=True
            ).first()
            if user:
                return user, email_address.email
        return None

    def pre_social_login(self, request, sociallogin):
        """
        소셜 로그인 완료 직전 호출

        - 이미 연결된 소셜 계정이면 기존 계정으로 로그인
        - 이메일 기반 자동 연결은 authenticate_by_email()이 담당한다
        """
        from allauth.socialaccount.models import SocialAccount

        # 1. 이미 연결된 소셜 계정 확인 (중복 생성 방지)
        try:
            existing_social = SocialAccount.objects.get(
                provider=sociallogin.account.provider,
                uid=sociallogin.account.uid
            )
            # 기존 계정이 있으면 해당 사용자로 연결
            sociallogin.connect(request, existing_social.user)
            self._update_metadata(existing_social)
            return
        except SocialAccount.DoesNotExist:
            pass

        # 2. 이메일 기반 자동 연결은 authenticate_by_email()에서 처리된다.
        # SocialLogin.lookup()이 이 메서드보다 먼저 실행되므로 여기서 매칭하면
        # 이미 붙은 연결을 되돌릴 수 없다.
        super().pre_social_login(request, sociallogin)

    def authentication_error(
        self,
        request,
        provider_id,
        error=None,
        exception=None,
        extra_context=None
    ):
        """
        소셜 인증 에러 처리

        에러 발생 시 프론트엔드로 리다이렉트합니다.
        """
        import logging
        logger = logging.getLogger('accounts.social')

        logger.error(
            f"Social auth error for {provider_id}: {error}",
            extra={
                'provider': provider_id,
                'error': str(error),
                'exception': str(exception) if exception else None,
            }
        )

        # 프론트엔드 에러 페이지로 리다이렉트
        from django.shortcuts import redirect
        error_url = f"{settings.FRONTEND_URL}/auth/error?provider={provider_id}&error={error}"
        return redirect(error_url)

    def get_connect_redirect_url(self, request, socialaccount):
        """
        소셜 계정 연결 후 리다이렉트 URL

        계정 연결 완료 후 프로필 페이지로 리다이렉트합니다.
        """
        return f"{settings.FRONTEND_URL}/profile?linked=success&provider={socialaccount.provider}"

    def _create_metadata(self, social_account, linked_by='auto_email'):
        """
        SocialAccountMetadata 생성

        Args:
            social_account: allauth SocialAccount 인스턴스
            linked_by: 연결 방법 (registration, auto_email, manual)
        """
        from .models import SocialAccountMetadata

        metadata, created = SocialAccountMetadata.objects.get_or_create(
            social_account=social_account,
            defaults={
                'linked_by': linked_by,
                'access_count': 1,
                'last_used_at': timezone.now(),
            }
        )

        if not created:
            # 이미 존재하는 경우 업데이트
            self._update_metadata(social_account)

        return metadata

    def _update_metadata(self, social_account):
        """
        SocialAccountMetadata 업데이트

        로그인 시 access_count를 증가시키고 last_used_at을 갱신합니다.
        """
        from .models import SocialAccountMetadata

        SocialAccountMetadata.objects.filter(
            social_account=social_account
        ).update(
            access_count=F('access_count') + 1,
            last_used_at=timezone.now()
        )
