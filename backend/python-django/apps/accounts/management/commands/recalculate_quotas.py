"""
사용자 쿼터 재계산 관리 커맨드

모든 사용자의 스토리지 사용량을 노트 파일 크기 합계로 재계산합니다.
정기적인 정합성 검증 또는 데이터 수정 후 복구에 사용됩니다.

사용법:
    python manage.py recalculate_quotas
    python manage.py recalculate_quotas --dry-run
    python manage.py recalculate_quotas --batch-size 500
    python manage.py recalculate_quotas --user-id 123

부하 분석:
    - 단일 GROUP BY 쿼리로 O(1) DB 조회
    - 배치 업데이트로 대규모 데이터도 안전 처리
    - 웹 서버와 별도 프로세스로 실행 (서비스 영향 없음)
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce

from apps.accounts.models import User, UserQuota
from apps.notes.models import Note


def chunks(queryset, batch_size):
    """QuerySet을 배치 단위로 나누는 제너레이터"""
    start = 0
    while True:
        batch = list(queryset[start:start + batch_size])
        if not batch:
            break
        yield batch
        start += batch_size


class Command(BaseCommand):
    help = '모든 사용자의 스토리지 사용량을 노트 파일 크기 합계로 재계산합니다.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='실제 변경 없이 계산 결과만 미리보기',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='한 번에 처리할 사용자 수 (기본: 1000)',
        )
        parser.add_argument(
            '--user-id',
            type=int,
            help='특정 사용자 ID만 재계산',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='상세 출력 모드',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        batch_size = options['batch_size']
        user_id = options.get('user_id')
        verbose = options['verbose']

        if dry_run:
            self.stdout.write(self.style.WARNING('=== DRY RUN 모드 (변경 없음) ==='))

        # 단일 GROUP BY 쿼리로 사용자별 스토리지 사용량 계산
        # Note: deleted_at이 설정된 노트도 포함 (휴지통 파일도 용량에 포함)
        storage_query = Note.objects.all_with_deleted().values('user_id').annotate(
            total_size=Coalesce(Sum('file_size'), 0)
        )

        if user_id:
            storage_query = storage_query.filter(user_id=user_id)

        storage_by_user = {item['user_id']: item['total_size'] for item in storage_query}

        self.stdout.write(f'계산된 사용자 수: {len(storage_by_user)}')

        # 모든 사용자에 대해 쿼터 동기화
        if user_id:
            users = User.objects.filter(id=user_id)
        else:
            users = User.objects.all()

        updated_count = 0
        created_count = 0
        unchanged_count = 0
        total_difference = 0

        # 배치 처리
        for user_batch in chunks(users.order_by('id'), batch_size):
            with transaction.atomic():
                for user in user_batch:
                    calculated_size = storage_by_user.get(user.id, 0)

                    try:
                        quota = UserQuota.objects.get(user=user)
                        current_size = quota.storage_used_bytes
                        difference = calculated_size - current_size

                        if difference != 0:
                            if verbose or dry_run:
                                self.stdout.write(
                                    f'  User {user.id} ({user.username}): '
                                    f'{current_size / 1024 / 1024:.2f}MB → {calculated_size / 1024 / 1024:.2f}MB '
                                    f'(차이: {difference / 1024 / 1024:+.2f}MB)'
                                )
                            if not dry_run:
                                quota.storage_used_bytes = calculated_size
                                quota.save(update_fields=['storage_used_bytes', 'updated_at'])
                            updated_count += 1
                            total_difference += abs(difference)
                        else:
                            unchanged_count += 1
                            if verbose:
                                self.stdout.write(
                                    f'  User {user.id} ({user.username}): '
                                    f'{current_size / 1024 / 1024:.2f}MB (변경 없음)'
                                )

                    except UserQuota.DoesNotExist:
                        # 쿼터가 없는 사용자는 새로 생성
                        if not dry_run:
                            UserQuota.objects.create(
                                user=user,
                                storage_used_bytes=calculated_size
                            )
                        if verbose or dry_run:
                            self.stdout.write(
                                f'  User {user.id} ({user.username}): '
                                f'새 쿼터 생성 ({calculated_size / 1024 / 1024:.2f}MB)'
                            )
                        created_count += 1

        # 결과 요약
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=== 재계산 완료 ==='))
        self.stdout.write(f'  업데이트된 쿼터: {updated_count}')
        self.stdout.write(f'  새로 생성된 쿼터: {created_count}')
        self.stdout.write(f'  변경 없음: {unchanged_count}')
        self.stdout.write(f'  총 차이: {total_difference / 1024 / 1024:.2f}MB')

        if dry_run:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(
                '이것은 DRY RUN입니다. 실제로 변경하려면 --dry-run 플래그를 제거하세요.'
            ))
