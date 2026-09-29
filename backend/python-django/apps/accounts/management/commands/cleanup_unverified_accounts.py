"""
만료된 미인증 계정 정리 Management Command

is_active=False인 계정 중 EmailVerification 토큰이 만료된(24시간 초과) 계정을 삭제합니다.
이메일 선점 공격(계정 DoS)으로 생성된 방치 계정을 주기적으로 제거합니다.

사용법:
    python manage.py cleanup_unverified_accounts
    python manage.py cleanup_unverified_accounts --dry-run   # 삭제 없이 대상만 출력
"""
import logging
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
User = get_user_model()


class Command(BaseCommand):
    help = '만료된 미인증 계정(is_active=False, 인증 토큰 24시간 초과)을 삭제합니다.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='실제 삭제 없이 대상 계정 수만 출력합니다.',
        )

    def handle(self, *args, **options):
        from apps.accounts.models import EmailVerification

        dry_run = options['dry_run']
        expiry_threshold = timezone.now() - timezone.timedelta(hours=24)

        # 만료된 EmailVerification 레코드와 연결된 미인증 계정 조회
        expired_verifications = EmailVerification.objects.filter(
            is_verified=False,
            created_at__lt=expiry_threshold,
        ).select_related('user')

        target_users = [
            ev.user for ev in expired_verifications
            if not ev.user.is_active
        ]

        # EmailVerification 없이 is_active=False인 계정도 정리 (비정상 상태)
        verified_user_ids = EmailVerification.objects.values_list('user_id', flat=True)
        orphan_inactive_users = list(
            User.objects.filter(
                is_active=False,
                date_joined__lt=expiry_threshold,
            ).exclude(id__in=verified_user_ids)
        )

        all_targets = target_users + orphan_inactive_users
        total = len(all_targets)

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'[DRY-RUN] 삭제 대상 미인증 계정: {total}개'
                )
            )
            for user in all_targets:
                self.stdout.write(f'  - {user.email} (가입일: {user.date_joined})')
            return

        if total == 0:
            self.stdout.write(self.style.SUCCESS('정리할 만료 미인증 계정이 없습니다.'))
            return

        deleted_count = 0
        for user in all_targets:
            email = user.email
            try:
                user.delete()
                deleted_count += 1
                logger.info(
                    'cleanup_unverified_accounts: deleted expired unverified account',
                    extra={'email': email}
                )
            except Exception as e:
                logger.error(
                    'cleanup_unverified_accounts: failed to delete account',
                    extra={'email': email, 'error': str(e)}
                )
                self.stderr.write(f'삭제 실패 ({email}): {e}')

        self.stdout.write(
            self.style.SUCCESS(
                f'만료된 미인증 계정 {deleted_count}/{total}개 삭제 완료.'
            )
        )
