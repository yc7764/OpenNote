"""
샘플 노트 자동 생성 모듈

신규 사용자 계정 생성(이메일 인증 완료 / 소셜 가입) 시
완성된 샘플 노트를 생성하여 서비스 체험을 돕는다.

- 쿼터 시스템 완전 바이패스 (file_size=0, record_note_created 미호출)
- 실패해도 가입/인증 플로우 중단 안 함
- 사용자당 1회만 생성 (멱등, UniqueConstraint + 더블 체크)

샘플 콘텐츠(녹취·요약)는 저장소에 두지 않는다. 외부 데이터셋의 재배포 조건 때문에
오디오와 같은 스토리지(S3/MinIO 또는 로컬 media)에 JSON으로 두고 런타임에 읽는다.
파일이 없으면 샘플 노트를 만들지 않고 넘어간다(가입 플로우는 그대로 진행).

데이터 파일 형식 (SAMPLE_DATA_PATH):
    {
      "note":     {"title", "preview", "duration_seconds", "speakers"},
      "summary":  {"keywords", "main_topic", "next_actions"},
      "sections": [{"title", "start_seconds", "end_seconds", "content", "order"}, ...],
      "segments": [{"idx", "start", "end", "speaker", "text"}, ...]
    }
"""
import json
import logging
from datetime import timedelta

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction

from .models import SAMPLE_AUDIO_PREFIX, Note, NoteSegment, Summary, SummarySection

logger = logging.getLogger(__name__)

# 스토리지 고정 경로 (공유 파일 — post_delete signal에서 SAMPLE_AUDIO_PREFIX로 보호)
SAMPLE_AUDIO_PATH = f'{SAMPLE_AUDIO_PREFIX}opennote-guide.wav'
SAMPLE_DATA_PATH = getattr(
    settings, 'SAMPLE_NOTE_DATA_PATH', f'{SAMPLE_AUDIO_PREFIX}opennote-guide.json'
)

# 성공한 로드만 캐시한다. 실패를 캐시하면 운영 중 파일을 올려도 재기동 전까지 반영되지 않는다.
_sample_data_cache = None


def _parse_sample_data(raw):
    """JSON 원본을 모델 생성용 dict로 변환한다. 형식이 틀리면 KeyError/TypeError/ValueError."""
    note = raw['note']
    return {
        'note': {
            'title': note['title'],
            'preview': note['preview'],
            'duration': timedelta(seconds=float(note['duration_seconds'])),
            'speakers': note['speakers'],
            'processing_status': 'completed',
            'is_recording': False,
        },
        'summary': {
            'keywords': raw['summary']['keywords'],
            'main_topic': raw['summary']['main_topic'],
            'next_actions': raw['summary']['next_actions'],
        },
        'sections': [
            {
                'title': sec['title'],
                'start_time': timedelta(seconds=float(sec['start_seconds'])),
                'end_time': timedelta(seconds=float(sec['end_seconds'])),
                'content': sec['content'],
                'order': int(sec['order']),
            }
            for sec in raw['sections']
        ],
        'segments': [
            {
                'idx': int(seg['idx']),
                'start': float(seg['start']),
                'end': float(seg['end']),
                'speaker': seg['speaker'],
                'text': seg['text'],
            }
            for seg in raw['segments']
        ],
    }


def load_sample_data():
    """스토리지에서 샘플 데이터를 읽는다. 없거나 형식이 틀리면 None."""
    global _sample_data_cache
    if _sample_data_cache is not None:
        return _sample_data_cache

    try:
        with default_storage.open(SAMPLE_DATA_PATH, 'rb') as f:
            raw = json.loads(f.read().decode('utf-8'))
        _sample_data_cache = _parse_sample_data(raw)
        return _sample_data_cache
    except FileNotFoundError:
        logger.warning("Sample note data not found at %s — skipping sample note", SAMPLE_DATA_PATH)
    except Exception:
        logger.exception("Sample note data at %s is unreadable — skipping sample note", SAMPLE_DATA_PATH)
    return None


def create_sample_note_if_needed(user) -> bool:
    """
    멱등 샘플 노트 생성.

    - soft-delete 포함 all_objects로 체크하여 삭제 후 재생성 방지
    - transaction.atomic()으로 부분 생성 방지
    - 실패 시 False 반환, 호출자 플로우(가입/인증) 중단 안 함
    - 쿼터 시스템 완전 바이패스 (record_note_created 미호출)
    """
    # 빠른 경로: 트랜잭션 밖에서 먼저 체크
    if Note.all_objects.filter(user=user, is_sample=True).exists():
        return False

    try:
        data = load_sample_data()
        if data is None:
            return False

        with transaction.atomic():
            # 이중 체크: 트랜잭션 내부에서 재확인
            if Note.all_objects.filter(user=user, is_sample=True).exists():
                return False

            # 1. Summary 생성
            summary = Summary.objects.create(**data['summary'])

            # 2. SummarySection 벌크 생성
            SummarySection.objects.bulk_create([
                SummarySection(summary=summary, **section)
                for section in data['sections']
            ])

            # 3. content JSON 구성 (일반 노트의 STT 결과와 동일 구조)
            content = {
                'segments': [
                    {**seg, 'words': []}
                    for seg in data['segments']
                ],
                'word_segments': [],
            }

            # 4. Note 생성 (쿼터 바이패스 — ORM 직접 생성)
            note = Note(
                user=user,
                summary=summary,
                audio_file=SAMPLE_AUDIO_PATH,
                is_sample=True,
                file_size=0,
                content=content,
                **data['note'],
            )
            note.save()

            # 5. NoteSegment 벌크 생성
            NoteSegment.objects.bulk_create([
                NoteSegment(stt_id=note, **segment)
                for segment in data['segments']
            ])

        logger.info("Sample note created for user %s (note_id=%s)", user.id, note.id)
        return True

    except Exception:
        logger.exception("Sample note creation failed for user %s", user.id)
        return False
