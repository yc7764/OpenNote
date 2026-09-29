# Generated manually for social login master account feature
# 기존 사용자 데이터를 새 스키마로 마이그레이션

from django.db import migrations
from django.utils import timezone


def populate_master_account_data(apps, schema_editor):
    """
    기존 사용자들의 통합 계정 데이터 자동 마이그레이션
    - is_social_user 플래그 기반으로 계정 유형 결정
    - 비밀번호 존재 여부 확인
    - 소셜 계정 연결 방식 추론
    """
    User = apps.get_model('accounts', 'User')
    SocialAccount = apps.get_model('accounts', 'SocialAccount')
    EmailVerification = apps.get_model('accounts', 'EmailVerification')

    for user in User.objects.all():
        social_accounts = SocialAccount.objects.filter(user=user).order_by('created_at')

        # 비밀번호 사용 가능 여부 확인
        # Django는 unusable password를 '!'로 시작하는 해시로 저장
        has_password = bool(user.password) and not user.password.startswith('!')
        user.has_usable_password = has_password

        if social_accounts.exists():
            first_social = social_accounts.first()

            if not has_password and social_accounts.count() >= 1:
                # 소셜 전용 사용자
                user.primary_auth_method = first_social.provider
                user.created_via = f'social_{first_social.provider}'
            else:
                # 하이브리드 또는 이메일 우선 사용자
                user.primary_auth_method = 'email'
                user.created_via = 'registration'

            # 소셜 사용자는 OAuth 이메일이 검증됨
            if user.is_social_user:
                user.email_verified = True
                user.email_verified_at = user.date_joined

            user.save(update_fields=[
                'has_usable_password',
                'primary_auth_method',
                'created_via',
                'email_verified',
                'email_verified_at'
            ])

            # 소셜 계정 linked_by 설정
            for i, sa in enumerate(social_accounts):
                if i == 0 and not has_password:
                    # 첫 번째 소셜 계정이고 비밀번호 없음 = 가입 시 사용
                    sa.linked_by = 'registration'
                else:
                    # 이후 연결된 계정 = 자동 이메일 연결로 추정
                    sa.linked_by = 'auto_email'

                # linked_at이 None이면 created_at으로 설정
                if not sa.linked_at:
                    sa.linked_at = sa.created_at

                sa.save(update_fields=['linked_by', 'linked_at'])
        else:
            # 이메일 전용 사용자
            user.primary_auth_method = 'email'
            user.created_via = 'registration'
            user.has_usable_password = has_password

            # EmailVerification 확인
            try:
                email_verification = EmailVerification.objects.get(user=user)
                if email_verification.is_verified:
                    user.email_verified = True
                    user.email_verified_at = email_verification.created_at
            except EmailVerification.DoesNotExist:
                pass

            user.save(update_fields=[
                'has_usable_password',
                'primary_auth_method',
                'created_via',
                'email_verified',
                'email_verified_at'
            ])


def reverse_populate(apps, schema_editor):
    """
    역마이그레이션 - 새 필드들을 기본값으로 리셋
    데이터 손실 없이 스키마만 롤백 가능하도록 함
    """
    # 역마이그레이션 시 특별한 작업 필요 없음
    # 필드 삭제는 0009 마이그레이션 롤백에서 처리됨
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_add_master_account_fields'),
    ]

    operations = [
        migrations.RunPython(
            populate_master_account_data,
            reverse_populate,
            hints={'model_name': 'user'}
        ),
    ]
