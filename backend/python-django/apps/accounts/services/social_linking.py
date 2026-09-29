"""
소셜 계정 연결/해제 관련 함수

dj-rest-auth + allauth 기반으로 리팩토링됨.
allauth.socialaccount.SocialAccount를 사용합니다.
"""
import logging
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from datetime import timedelta
from django.core.exceptions import ValidationError

from allauth.socialaccount.models import SocialAccount
from ..models import SocialAccountMetadata, SocialVerificationToken

User = get_user_model()
logger = logging.getLogger(__name__)


def link_social_account(user, provider, social_id, social_email, social_name, linked_by='auto_email'):
    """
    기존 사용자와 소셜 계정 연결

    Note: 이 함수는 allauth의 SocialAccount를 직접 생성합니다.
    일반적으로 allauth의 adapter가 처리하지만, 수동 연결 시 사용됩니다.

    Args:
        user: 연결할 사용자
        provider: 소셜 제공자 (github, google, naver, kakao)
        social_id: 소셜 서비스의 고유 ID
        social_email: 소셜 계정 이메일
        social_name: 소셜 계정 이름
        linked_by: 연결 방식 (registration, auto_email, manual)

    Returns:
        User: 연결된 사용자 객체
    """
    try:
        # 데이터 검증
        if not social_id:
            raise ValidationError("소셜 ID가 필요합니다.")

        # 중복 연결 방지
        existing = SocialAccount.objects.filter(user=user, provider=provider).first()
        if existing:
            logger.info(f"Social account already linked: {user.username} - {provider}")
            # 메타데이터 접근 기록 업데이트
            try:
                metadata = existing.metadata
                metadata.access_count += 1
                metadata.last_used_at = timezone.now()
                metadata.save(update_fields=['access_count', 'last_used_at'])
            except SocialAccountMetadata.DoesNotExist:
                pass
            return user

        # 다른 사용자에게 이미 연결된 소셜 계정인지 확인
        if SocialAccount.objects.filter(provider=provider, uid=str(social_id)).exists():
            raise ValidationError(f"이 {provider} 계정은 이미 다른 사용자에게 연결되어 있습니다.")

        # allauth SocialAccount 생성
        social_account = SocialAccount.objects.create(
            user=user,
            provider=provider,
            uid=str(social_id),
            extra_data={
                'email': social_email or '',
                'name': social_name or '',
            }
        )

        # SocialAccountMetadata 생성
        SocialAccountMetadata.objects.create(
            social_account=social_account,
            linked_by=linked_by,
            access_count=1,
            last_used_at=timezone.now()
        )

        user.is_social_user = True
        user.save(update_fields=['is_social_user'])

        logger.info(f"Social account linked: {user.username} - {provider} (linked_by={linked_by})")
        return user

    except Exception as e:
        logger.error(f"Error linking social account: {str(e)}")
        raise


def create_social_verification_token(user, provider, social_id, social_email, social_name):
    """소셜 로그인 인증 토큰 생성"""
    try:
        # 기존 토큰이 있으면 삭제
        SocialVerificationToken.objects.filter(
            user=user,
            provider=provider,
            social_id=social_id
        ).delete()

        # 새 토큰 생성
        token = SocialVerificationToken.objects.create(
            user=user,
            provider=provider,
            social_id=str(social_id),
            social_email=social_email or '',
            social_name=social_name or '',
            expires_at=timezone.now() + timedelta(hours=24)
        )

        return token

    except Exception as e:
        logger.error(f"Error creating social verification token: {str(e)}")
        raise


# send_social_verification_email 함수는 utils/email.py로 이동됨


def unlink_social_account(user, provider):
    """
    사용자의 소셜 계정 연결 해제

    마지막 인증 수단인 경우 해제 불가

    Args:
        user: User 객체
        provider: 소셜 제공자 (github, google, naver, kakao)

    Returns:
        bool: 성공 여부

    Raises:
        ValidationError: 해제 불가능한 경우
    """
    if not user.can_unlink_provider(provider):
        raise ValidationError(
            "마지막 인증 수단은 해제할 수 없습니다. "
            "먼저 비밀번호를 설정하거나 다른 소셜 계정을 연결하세요."
        )

    try:
        social_account = SocialAccount.objects.get(user=user, provider=provider)
        social_account.delete()

        # 남은 소셜 계정이 없으면 is_social_user 플래그 해제
        if not SocialAccount.objects.filter(user=user).exists():
            user.is_social_user = False
            user.save(update_fields=['is_social_user'])

        logger.info(f"Social account unlinked: {user.username} - {provider}")
        return True

    except SocialAccount.DoesNotExist:
        raise ValidationError(f"{provider} 계정이 연결되어 있지 않습니다.")
    except Exception as e:
        logger.error(f"Error unlinking social account: {str(e)}")
        raise


def set_password_for_social_user(user, new_password):
    """
    소셜 전용 사용자에게 비밀번호 설정

    Args:
        user: User 객체
        new_password: 새 비밀번호

    Returns:
        bool: 성공 여부
    """
    try:
        user.set_password(new_password)
        # Django의 set_password()가 자동으로 usable password로 설정

        # 기본 인증 방식을 이메일로 변경 (선택적)
        # 기존 primary_auth_method가 소셜인 경우만
        if user.primary_auth_method != 'email':
            # primary_auth_method는 그대로 유지 (사용자가 원래 가입한 방식 기록)
            pass

        user.save()

        logger.info(f"Password set for social user: {user.username}")
        return True

    except Exception as e:
        logger.error(f"Error setting password for social user: {str(e)}")
        raise


@transaction.atomic
def merge_accounts(target_user, source_user, keep_data='target'):
    """
    두 계정 병합

    소스 사용자의 소셜 계정을 타겟 사용자로 이동하고
    소스 사용자를 비활성화

    Args:
        target_user: 유지할 사용자
        source_user: 병합될 사용자 (비활성화됨)
        keep_data: 'target' or 'source' - 충돌 시 어느 데이터를 유지할지

    Returns:
        dict: 병합 결과 통계

    Note:
        @transaction.atomic 데코레이터로 모든 DB 작업이 원자적으로 실행됩니다.
        중간에 에러 발생 시 모든 변경사항이 롤백됩니다.
    """
    from apps.notes.models import Note  # 지연 임포트
    from ..models import UserQuota  # 지연 임포트

    try:
        stats = {
            'social_accounts_moved': 0,
            'notes_moved': 0,
            'folders_moved': 0,
            'labels_moved': 0,
            'quota_merged': False,
            'storage_overflow': False,
            'notes_deleted_for_storage': 0,
            'deleted_notes_info': [],  # 삭제된 노트 정보
            'sample_notes_deleted': 0,  # 병합 시 삭제된 샘플 노트 수
        }

        # 1. allauth SocialAccount 이동 또는 삭제
        for social_account in SocialAccount.objects.filter(user=source_user):
            # 동일 제공자가 이미 있으면 소스의 소셜 계정 삭제
            if SocialAccount.objects.filter(
                user=target_user,
                provider=social_account.provider
            ).exists():
                # 중복되는 소셜 계정은 삭제 (메타데이터도 CASCADE로 삭제됨)
                social_account.delete()
                logger.info(f"Deleted duplicate social account during merge: {social_account.provider}")
            else:
                social_account.user = target_user
                social_account.save()
                stats['social_accounts_moved'] += 1

        # 2. 쿼터 병합 처리
        target_quota = UserQuota.get_or_create_for_user(target_user)
        try:
            source_quota = UserQuota.objects.get(user=source_user)

            # 일일 노트 생성 횟수는 단순 합산 (오버플로우 허용)
            # 다음 날 리셋되므로 초과해도 문제 없음
            target_quota.daily_notes_created += source_quota.daily_notes_created

            # 스토리지 사용량 계산
            source_storage = source_quota.storage_used_bytes
            combined_storage = target_quota.storage_used_bytes + source_storage
            storage_limit = target_quota.storage_limit_bytes

            stats['quota_merged'] = True

            # 스토리지 초과 확인
            if combined_storage > storage_limit:
                stats['storage_overflow'] = True
                overflow_amount = combined_storage - storage_limit

                logger.warning(
                    f"Storage overflow during merge: {combined_storage} > {storage_limit} "
                    f"(overflow: {overflow_amount} bytes)"
                )

                # 소스 사용자의 오래된 노트부터 삭제하여 용량 확보
                # 노트를 이동하기 전에 삭제 처리
                notes_to_delete_qs = Note.objects.filter(
                    user=source_user
                ).order_by('created_at').values('id', 'title', 'created_at', 'file_size', 'summary_id')

                freed_space = 0
                deleted_notes_info = []
                note_ids_to_delete = []
                summary_ids_to_delete = []

                # 1단계: 삭제할 노트 선별 (N+1 쿼리 방지)
                for note_data in notes_to_delete_qs:
                    if freed_space >= overflow_amount:
                        break

                    note_size = note_data['file_size'] or 0
                    note_info = {
                        'id': note_data['id'],
                        'title': note_data['title'],
                        'created_at': note_data['created_at'].isoformat() if note_data['created_at'] else None,
                        'file_size': note_size,
                    }
                    deleted_notes_info.append(note_info)
                    note_ids_to_delete.append(note_data['id'])

                    if note_data['summary_id']:
                        summary_ids_to_delete.append(note_data['summary_id'])

                    freed_space += note_size

                # 2단계: 벌크 삭제 (Summary 먼저, Note 다음)
                if note_ids_to_delete:
                    # Note의 summary FK를 먼저 null로 설정
                    Note.objects.filter(id__in=note_ids_to_delete).update(summary=None)
                    # Summary 벌크 삭제
                    if summary_ids_to_delete:
                        from apps.notes.models import Summary
                        Summary.objects.filter(id__in=summary_ids_to_delete).delete()
                    # Note 벌크 삭제
                    Note.objects.filter(id__in=note_ids_to_delete).delete()

                stats['notes_deleted_for_storage'] = len(note_ids_to_delete)
                stats['deleted_notes_info'] = deleted_notes_info

                # 삭제 후 실제 사용량 재계산
                remaining_source_storage = Note.objects.filter(
                    user=source_user
                ).aggregate(total=Sum('file_size'))['total'] or 0

                # 스토리지 업데이트 (삭제된 용량 반영)
                target_quota.storage_used_bytes += remaining_source_storage

                logger.info(
                    f"Deleted {stats['notes_deleted_for_storage']} old notes to free "
                    f"{freed_space} bytes during merge"
                )
            else:
                # 스토리지 초과 없음 - 단순 합산
                target_quota.storage_used_bytes = combined_storage

            target_quota.save()

        except UserQuota.DoesNotExist:
            # 소스 사용자에 쿼터가 없으면 노트 파일 크기로 계산
            source_notes_size = Note.objects.filter(
                user=source_user
            ).aggregate(total=Sum('file_size'))['total'] or 0

            combined_storage = target_quota.storage_used_bytes + source_notes_size
            storage_limit = target_quota.storage_limit_bytes

            if combined_storage > storage_limit:
                stats['storage_overflow'] = True
                overflow_amount = combined_storage - storage_limit

                # 소스 사용자의 오래된 노트부터 삭제
                notes_to_delete = Note.objects.filter(
                    user=source_user
                ).order_by('created_at')

                freed_space = 0
                deleted_notes_info = []

                for note in notes_to_delete:
                    if freed_space >= overflow_amount:
                        break

                    note_size = note.file_size or 0
                    note_info = {
                        'id': note.id,
                        'title': note.title,
                        'created_at': note.created_at.isoformat() if note.created_at else None,
                        'file_size': note_size,
                    }
                    deleted_notes_info.append(note_info)

                    note.delete(hard_delete=True)
                    freed_space += note_size
                    stats['notes_deleted_for_storage'] += 1

                stats['deleted_notes_info'] = deleted_notes_info

                # 삭제 후 재계산
                remaining_source_storage = Note.objects.filter(
                    user=source_user
                ).aggregate(total=Sum('file_size'))['total'] or 0

                target_quota.storage_used_bytes += remaining_source_storage
            else:
                target_quota.storage_used_bytes = combined_storage

            target_quota.save()

        # 3. 샘플 노트 처리 및 일반 노트 이동
        # 3-1. 소스 사용자의 샘플 노트 삭제 (시스템 생성 데이터로 사용자 데이터 손실 없음)
        # all_objects 매니저를 사용하여 soft-deleted 샘플 노트도 함께 삭제
        source_sample_notes = Note.all_objects.filter(user=source_user, is_sample=True)
        sample_notes_deleted = source_sample_notes.count()

        if sample_notes_deleted > 0:
            logger.info(
                f"[계정 병합] 소스 사용자 {source_user.id}의 샘플 노트 {sample_notes_deleted}개 삭제 중"
            )
            source_sample_notes.delete()  # 하드 삭제

        # 3-2. 일반 노트만 타겟 사용자로 이전 (샘플 노트 명시적 제외)
        # M5: all_objects를 써서 휴지통(soft-deleted) 노트도 함께 이전한다. 과거엔
        # 기본 매니저(Note.objects)라 휴지통 노트가 이전되지 않고 이후 source_user.delete()
        # CASCADE로 무통보 파기돼, 30일 보관 정책을 위반하고 타겟 쿼터엔 그 용량이
        # 과대계상됐다. 이전하면 파일이 실제로 target 아래 존재하므로 쿼터도 정합해진다.
        regular_notes_count = Note.all_objects.filter(
            user=source_user,
            is_sample=False
        ).update(user=target_user)

        stats['notes_moved'] = regular_notes_count
        stats['sample_notes_deleted'] = sample_notes_deleted  # 통계에 추가

        # 4. 폴더/라벨은 현재 모델에 없음 (향후 추가 시 여기에 구현)
        # stats['folders_moved'] = 0
        # stats['labels_moved'] = 0

        # 5. 타겟 사용자 소셜 플래그 업데이트
        if SocialAccount.objects.filter(user=target_user).exists():
            target_user.is_social_user = True
            target_user.save(update_fields=['is_social_user'])

        # 6. 소스 사용자 완전 삭제
        # 모든 관련 데이터(SocialAccount, Quota 등)는 CASCADE로 자동 삭제됨
        source_user_info = f"{source_user.username} (id={source_user.id})"
        source_user.delete()
        logger.info(f"Source user deleted during merge: {source_user_info}")

        logger.info(
            f"Accounts merged: {source_user_info} -> {target_user.username}. "
            f"Stats: {stats}"
        )

        return stats

    except Exception as e:
        logger.error(f"Error merging accounts: {str(e)}")
        raise
