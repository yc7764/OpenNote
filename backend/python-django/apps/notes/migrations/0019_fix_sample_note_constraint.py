# Generated migration for fixing sample note constraint
from django.db import migrations, models
from django.db.models import Q, Count


def cleanup_duplicate_sample_notes(apps, schema_editor):
    """
    사용자당 활성 샘플 노트를 1개만 남기고 나머지 삭제

    안전장치:
    - try-except로 오류 처리
    - 벌크 삭제로 성능 및 원자성 보장
    - 정리 후 검증 단계 포함
    - 오류 시 전체 롤백 (PostgreSQL 트랜잭션)
    """
    Note = apps.get_model('notes', 'Note')

    try:
        # 1. 중복 사용자 식별
        users_with_duplicates = list(
            Note.objects
            .filter(is_sample=True, deleted_at__isnull=True)
            .values('user_id')
            .annotate(count=Count('id'))
            .filter(count__gt=1)
        )

        if not users_with_duplicates:
            print("✅ 중복된 샘플 노트가 없습니다.")
            return

        print(f"⚠️  중복 샘플 노트를 가진 사용자: {len(users_with_duplicates)}명")

        total_deleted = 0

        # 2. 각 사용자별 처리 (벌크 삭제)
        for user_data in users_with_duplicates:
            user_id = user_data['user_id']

            # 가장 오래된 것 제외하고 삭제할 ID 수집
            sample_notes = Note.objects.filter(
                user_id=user_id,
                is_sample=True,
                deleted_at__isnull=True
            ).order_by('created_at').values_list('id', flat=True)

            # 첫 번째(가장 오래된) 제외하고 나머지 삭제
            ids_to_delete = list(sample_notes[1:])

            if ids_to_delete:
                # 벌크 삭제 (성능 + 원자성)
                deleted_count, _ = Note.objects.filter(id__in=ids_to_delete).delete()
                total_deleted += deleted_count
                print(f"  사용자 {user_id}: {deleted_count}개 삭제")

        print(f"✅ 총 {total_deleted}개의 중복 샘플 노트 정리 완료")

        # 3. 정리 후 검증
        remaining_duplicates = Note.objects.filter(
            is_sample=True,
            deleted_at__isnull=True
        ).values('user_id').annotate(count=Count('id')).filter(count__gt=1).count()

        if remaining_duplicates > 0:
            raise Exception(
                f"❌ 정리 실패: 여전히 {remaining_duplicates}명의 사용자가 중복 샘플 노트 보유"
            )

        print("✅ 검증 완료: 모든 사용자가 샘플 노트 1개 이하 보유")

    except Exception as e:
        print(f"❌ 오류 발생: {str(e)}")
        print("⚠️  마이그레이션이 롤백됩니다. 데이터베이스는 원래 상태로 복구됩니다.")
        raise  # 재발생시켜 마이그레이션 실패 및 롤백 처리


class Migration(migrations.Migration):

    dependencies = [
        ('notes', '0018_note_is_sample_audio_file_blank'),
    ]

    operations = [
        # 1. 기존 제약 조건 제거
        migrations.RemoveConstraint(
            model_name='note',
            name='unique_sample_note_per_user',
        ),

        # 2. 중복 데이터 정리
        migrations.RunPython(
            cleanup_duplicate_sample_notes,
            reverse_code=migrations.RunPython.noop,
        ),

        # 3. 새 제약 조건 추가 (deleted_at 체크 포함)
        migrations.AddConstraint(
            model_name='note',
            constraint=models.UniqueConstraint(
                fields=['user'],
                condition=Q(is_sample=True, deleted_at__isnull=True),
                name='unique_sample_note_per_user'
            ),
        ),
    ]
