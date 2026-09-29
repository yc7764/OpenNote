"""
노트 관련 시그널 핸들러

노트 영구 삭제(hard delete) 시:
- 스토리지 쿼터 업데이트
- 스토리지의 오디오 파일 정리

(기존에 models.py와 signals.py로 분산돼 있던 post_delete 핸들러를 여기로 통합)
"""
import logging
from django.db.models.signals import post_delete
from django.dispatch import receiver
from .models import Note, Summary, SAMPLE_AUDIO_PREFIX

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=Note)
def delete_summary_on_note_delete(sender, instance, **kwargs):
    """
    L15: Note→Summary는 OneToOne이고 CASCADE 방향이 Summary→Note라, Note만 삭제하면
    Summary·SummarySection이 고아로 남는다. hard_delete()는 정리하지만 회원 탈퇴
    (user.delete() CASCADE)·계정 병합의 QuerySet.delete()는 이 정리를 타지 않아 고아
    행이 누적된다(개인 요약 데이터가 삭제 요청 후에도 잔존). Note 삭제 시 연결된
    Summary를 함께 제거한다(SummarySection은 Summary CASCADE로 삭제). filter().delete()라
    이미 정리된 경우(hard_delete)에도 안전하게 no-op이 된다.
    """
    summary_id = getattr(instance, 'summary_id', None)
    if summary_id:
        try:
            Summary.objects.filter(id=summary_id).delete()
        except Exception:
            logger.exception(f"Failed to delete summary on note delete: note_id={instance.id}")


@receiver(post_delete, sender=Note)
def update_quota_on_note_delete(sender, instance, **kwargs):
    """
    노트 영구 삭제 시 스토리지 쿼터 업데이트

    휴지통 비우기(hard delete) 시에만 호출됩니다.
    soft delete(휴지통 이동)는 deleted_at 필드만 설정하므로 이 시그널이 발생하지 않습니다.
    """
    if instance.user and instance.file_size > 0:
        try:
            from apps.accounts.models import UserQuota
            quota = UserQuota.objects.filter(user=instance.user).first()
            if quota:
                quota.record_file_deleted(instance.file_size)
        except Exception:
            # 쿼터 업데이트 실패가 삭제를 막으면 안 됨
            logger.exception(f"Failed to update quota on note delete: note_id={instance.id}")


@receiver(post_delete, sender=Note)
def delete_note_audio_file(sender, instance, **kwargs):
    """
    노트 레코드 삭제 후 스토리지의 오디오 파일도 정리.

    파일 삭제는 트랜잭션 커밋이 확정된 뒤(on_commit)에만 실행한다 —
    post_delete는 트랜잭션 안에서 발생하므로, 즉시 지우면 이후 롤백 시
    DB 행은 되살아나는데 파일만 사라진 불일치가 남는다.
    (트랜잭션 밖에서 삭제된 경우 on_commit 콜백은 즉시 실행된다)
    """
    if not instance.audio_file:
        return
    name = instance.audio_file.name
    # 샘플 오디오 경로(notes/audio/sample/*)는 공유 파일이므로 삭제 안 함
    if not name or name.startswith(SAMPLE_AUDIO_PREFIX):
        return
    storage = instance.audio_file.storage
    note_pk = instance.pk

    def _delete_file():
        try:
            if storage.exists(name):
                storage.delete(name)
        except Exception:
            # DB 삭제는 이미 커밋됨 — 스토리지 삭제 실패가 침묵하면
            # 고아 파일 누적을 관측할 수 없으므로 로그는 남긴다
            logger.warning(
                '오디오 파일 삭제 실패 — 고아 파일 가능: note=%s', note_pk,
                exc_info=True,
            )

    from django.db import transaction
    transaction.on_commit(_delete_file)
