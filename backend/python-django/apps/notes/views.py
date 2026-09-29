from django.core.paginator import Paginator, EmptyPage
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
from .models import Note, NoteSegment, Summary
from .serializers import NoteSegmentSerializer
from apps.accounts.utils import (
    check_favorite_toggle_attempts,
    record_favorite_toggle_attempt,
    check_trash_action_attempts,
    record_trash_action_attempt,
)
from apps.accounts.models import UserQuota
from apps.common.logging_utils import log_resource_event
import logging
import magic
import uuid
from django.utils import timezone
from datetime import timedelta
import os

logger = logging.getLogger(__name__)

ALLOWED_AUDIO_EXTENSIONS = ('.wav', '.mp3', '.m4a', '.flac', '.aac', '.ogg', '.opus', '.wma', '.aiff')

AUDIO_CONTENT_TYPE_MAP = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.wma': 'audio/x-ms-wma',
    '.aiff': 'audio/aiff',
}

# libmagic 이 실제로 반환하는 MIME 타입 기준 (HTTP Content-Type 표준과 다를 수 있음)
# 검증: docker exec backend uv run python3 -c "import magic; print(magic.from_buffer(...))"
ALLOWED_AUDIO_MIME_TYPES = {
    'audio/mpeg',           # mp3
    'audio/wav',            # wav
    'audio/x-wav',          # wav (libmagic 실제 반환값)
    'audio/flac',           # flac
    'audio/x-flac',         # flac (일부 libmagic 버전)
    'audio/ogg',            # ogg / opus
    'audio/mp4',            # m4a (일부 libmagic 버전)
    'audio/x-m4a',          # m4a (libmagic 실제 반환값)
    'audio/aac',            # aac
    'audio/x-hx-aac-adts',  # aac ADTS (libmagic 실제 반환값)
    'audio/x-ms-wma',       # wma (HTTP Content-Type 표준)
    'video/x-ms-asf',       # wma (libmagic: ASF 컨테이너로 감지)
    'audio/aiff',           # aiff
    'audio/x-aiff',         # aiff (libmagic 실제 반환값)
}


# GET 경로 복원 상한 — 요청 하나가 만드는 쓰기 규모를 제한한다.
# 실측: 5,000행 bulk_create+직렬화 ≈ 300ms(dev). 세그먼트 5,000개 ≈ 7시간+ 분량이라
# 현실 노트는 전부 상한 안에 들어오고, 초과는 사실상 비정상 데이터뿐이다.
# 초과분은 content 폴백으로 응답(열람 정상)하고 restore_note_segments 커맨드로 복원한다.
MAX_RESTORE_SEGMENTS_PER_REQUEST = 5000


def _safe_int(value, default=0):
    """int 변환 실패 시(비정상 세그먼트 데이터) 예외 대신 기본값을 반환한다."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value, default=0.0):
    """float 변환 실패 시 예외 대신 기본값을 반환한다."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _restore_segments_from_content(note):
    """
    NoteSegment 파티션 삭제 후 note.content에서 파싱하여 재생성.
    - select_for_update()로 Note 행 잠금 → race condition 방지
    - 명시적 타입 cast + words None 방어
    - bulk_create 실패 시 content 직접 반환 (graceful fallback)
    - 건수 상한 초과 시 복원 없이 content 폴백 (GET의 무제한 DB 쓰기 방지)
    """
    content = note.content
    if not content or not isinstance(content, dict):
        return []

    raw_segments = content.get('segments', [])
    if not raw_segments or not isinstance(raw_segments, list):
        return []

    if len(raw_segments) > MAX_RESTORE_SEGMENTS_PER_REQUEST:
        logger.warning(
            f"Skipping inline segment restore for note_id={note.id}: "
            f"{len(raw_segments)} segments exceeds cap {MAX_RESTORE_SEGMENTS_PER_REQUEST}. "
            "Use 'manage.py restore_note_segments' to restore."
        )
        return _format_content_segments(note, raw_segments)

    try:
        with transaction.atomic():
            note_locked = Note.objects.select_for_update().get(id=note.id)
            if note_locked.segments.exists():
                return NoteSegmentSerializer(
                    note_locked.segments.all().order_by('idx'), many=True
                ).data

            segments_to_create = [
                NoteSegment(
                    stt_id=note_locked,
                    idx=int(seg.get('idx', i + 1)),
                    start=float(seg.get('start', 0.0)),
                    end=float(seg.get('end', 0.0)),
                    speaker=str(seg.get('speaker', '')),
                    text=str(seg.get('text', '')),
                    words=seg.get('words') or [],
                )
                for i, seg in enumerate(raw_segments)
            ]
            created = NoteSegment.objects.bulk_create(segments_to_create, batch_size=1000)
            logger.info(
                f"Restored {len(created)} segments from content for note_id={note.id}"
            )
            return NoteSegmentSerializer(created, many=True).data

    except Exception as exc:
        logger.warning(
            f"Failed to restore segments for note_id={note.id}: {exc}. "
            "Falling back to content-only response."
        )
        return _format_content_segments(note, raw_segments)


def _format_content_segments(note, raw_segments):
    """
    DB 재생성 실패 시 content 데이터를 API 응답 형식으로 직접 변환.
    segment_id에 idx 값 사용 (프론트엔드 list key 호환).
    """
    result = []
    for i, seg in enumerate(raw_segments):
        speaker = str(seg.get('speaker', ''))
        speaker_name = speaker
        if note.speakers and speaker:
            speaker_info = note.speakers.get(speaker, {})
            speaker_name = speaker_info.get('name', speaker)

        # L7: 폴백은 절대 예외를 던지면 안 된다. _restore가 int/float 캐스팅 실패로
        # 여기로 넘어온 경우, 같은 캐스팅을 try 없이 다시 하면 동일 예외로 note_detail이
        # 500이 됐다. 안전 변환으로 비정상 값은 기본값 처리하고 열람은 되게 한다.
        result.append({
            'segment_id': _safe_int(seg.get('idx', i + 1), i + 1),
            'idx': _safe_int(seg.get('idx', i + 1), i + 1),
            'start': _safe_float(seg.get('start', 0.0)),
            'end': _safe_float(seg.get('end', 0.0)),
            'speaker': speaker,
            'speaker_name': speaker_name,
            'text': str(seg.get('text', '')),
            'stt_id': note.id,
            'created_at': note.created_at.isoformat(),
            'updated_at': None,
            'updated_by': None,
        })
    return result


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def note_list(request):
    """
    사용자의 노트 목록을 반환 (서버사이드 페이지네이션 + 필터/정렬/검색)

    Query Parameters:
        page (int): 현재 페이지 번호 (기본값: 1)
        page_size (int): 페이지당 항목 수 (10, 20, 50 허용, 기본값: 20)
        status (str): 상태 필터 - pending, processing, done, failed
        sort (str): 정렬 - newest, oldest, title-asc, title-desc, duration-asc, duration-desc
        search (str): 제목+미리보기 검색 (case-insensitive)
        favorites (str): 'true'이면 즐겨찾기만 필터링
    """
    # 기본 쿼리셋 (커스텀 매니저로 삭제된 노트 자동 제외)
    notes = Note.objects.filter(user=request.user).select_related('summary')

    # 즐겨찾기 필터
    if request.query_params.get('favorites', '').lower() == 'true':
        notes = notes.filter(is_favorite=True)

    # 상태 필터 (프론트엔드 필터 그룹 → DB 값 매핑)
    STATUS_MAP = {
        'pending': ['pending', 'uploaded'],
        'processing': ['processing', 'summarizing'],
        'done': ['completed'],
        'failed': ['failed', 'expired'],
    }
    status_filter = request.query_params.get('status', '')
    if status_filter in STATUS_MAP:
        notes = notes.filter(processing_status__in=STATUS_MAP[status_filter])

    # 검색 (제목 + 미리보기, case-insensitive, 최대 200자)
    search = request.query_params.get('search', '').strip()[:200]
    if search:
        notes = notes.filter(
            Q(title__icontains=search) | Q(preview__icontains=search)
        )

    # 정렬
    SORT_MAP = {
        'newest': '-created_at',
        'oldest': 'created_at',
        'title-asc': 'title',
        'title-desc': '-title',
        'duration-asc': 'duration',
        'duration-desc': '-duration',
    }
    sort = request.query_params.get('sort', 'newest')
    notes = notes.order_by(SORT_MAP.get(sort, '-created_at'))

    # 페이지네이션
    ALLOWED_PAGE_SIZES = {10, 20, 50}
    try:
        page_size = int(request.query_params.get('page_size', 20))
    except (ValueError, TypeError):
        page_size = 20
    if page_size not in ALLOWED_PAGE_SIZES:
        page_size = 20

    try:
        page_num = max(1, int(request.query_params.get('page', 1)))
    except (ValueError, TypeError):
        page_num = 1

    paginator = Paginator(notes, page_size)
    try:
        page_obj = paginator.page(page_num)
    except EmptyPage:
        # 범위 초과 시 마지막 페이지로 폴백
        page_obj = paginator.page(paginator.num_pages)

    # 직렬화 (현재 페이지의 노트만)
    notes_data = []
    for note in page_obj:
        keywords = note.summary.keywords if note.summary else []
        notes_data.append({
            'id': note.id,
            'title': note.title,
            'is_recording': note.is_recording,
            'duration': note.duration.total_seconds() if note.duration else 0,
            'processing_status': note.processing_status,
            'preview': note.preview,
            'created_at': note.created_at.isoformat(),
            'updated_at': note.updated_at.isoformat(),
            'keywords': keywords,
            'is_favorite': note.is_favorite,
            'is_sample': note.is_sample,
        })

    return Response({
        'notes': notes_data,
        'pagination': {
            'current_page': page_obj.number,
            'total_pages': paginator.num_pages,
            'total_count': paginator.count,
            'page_size': page_size,
            'has_next': page_obj.has_next(),
            'has_previous': page_obj.has_previous(),
        }
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def note_detail(request, note_id):
    """특정 노트의 상세 정보를 반환"""
    try:
        note = Note.objects.get(id=note_id, user=request.user)

        # NoteSegment 테이블에서 직접 조회 (words 필드 제외)
        # 파티션 삭제로 세그먼트가 없으면 note.content에서 복원
        segments = note.segments.all().order_by('idx')
        if segments.exists():
            segments_data = NoteSegmentSerializer(segments, many=True).data
        else:
            segments_data = _restore_segments_from_content(note)

        # 요약 정보 처리
        summary_data = None
        if note.summary:
            summary_data = {
                'keywords': note.summary.keywords,
                'main_topic': note.summary.main_topic,
                'next_actions': note.summary.next_actions,
                'sections': []
            }

            # 구간 요약 정보
            for section in note.summary.sections.all():
                summary_data['sections'].append({
                    'title': section.title,
                    'start_time': section.start_time.total_seconds(),
                    'end_time': section.end_time.total_seconds(),
                    'content': section.content,
                    'order': section.order
                })

        return Response({
            'id': note.id,
            'title': note.title,
            'segments': segments_data,
            'speakers': note.speakers or {},  # 스피커 메타데이터 ({"sp_0": {"name": "참석자1"}, ...})
            'is_recording': note.is_recording,
            'duration': note.duration.total_seconds() if note.duration else 0,
            'processing_status': note.processing_status,
            'preview': note.preview,
            'created_at': note.created_at.isoformat(),
            'updated_at': note.updated_at.isoformat(),
            'summary': summary_data,
            'audio_file_url': f"{request.build_absolute_uri('/')[:-1]}/api/notes/{note.id}/play/" if note.audio_file else None,
            'is_favorite': note.is_favorite,
            'is_sample': note.is_sample,
            'user_description': note.user_description,
            'user_keywords': note.user_keywords,
        })
    except Note.DoesNotExist:
        return Response({'error': '노트를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def note_create(request):
    """새 노트 생성 및 AI 처리 Task 제출"""
    try:
        from mutagen import File as MutagenFile
        from django.db import transaction
        from .utils import calculate_stt_time_limit
        from .models import ProcessingTask
        from celery import current_app as celery_app

        # === 1. 파일 유효성 검사 (쿼터 잠금 전에 수행하여 잠금 시간 최소화) ===

        # 제목 정리 및 길이 제한 적용 (DB 제약과 일치)
        raw_title = request.data.get('title', '제목 없음')
        title = (raw_title or '제목 없음').strip()[:20]
        audio_file = request.FILES.get('audio_file')

        # 사용자 제공 메타데이터 (AI 요약 품질 향상용)
        user_description = (request.data.get('description', '') or '').strip()
        keywords_raw = request.data.get('keywords', '')
        user_keywords = [k.strip() for k in (keywords_raw or '').split(',') if k.strip()]

        # 사용자 제공 메타데이터 크기 제한
        # (미검증 시 키워드는 ArrayField CharField(max_length=50) 초과로 DB DataError,
        #  description은 상한이 없어 무제한 저장됨)
        if len(user_description) > 2000:
            return Response({'error': '설명은 2000자를 초과할 수 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(user_keywords) > 20:
            return Response({'error': '키워드는 최대 20개까지 입력할 수 있습니다.'}, status=status.HTTP_400_BAD_REQUEST)
        if any(len(k) > 50 for k in user_keywords):
            return Response({'error': '각 키워드는 50자를 초과할 수 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        if not audio_file:
            return Response({'error': '음원 파일을 업로드해야 합니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 파일 크기 변수 저장 (쿼터 검증 및 Note 저장용)
        file_size = audio_file.size

        # 파일 크기 검사 (단일 파일 1GB 제한)
        if file_size > 1 * 1024 * 1024 * 1024:
            return Response({'error': '파일 크기가 1GB를 초과합니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 파일 확장자 검사 (1차 방어 - mutagen + Whisper 모두 지원하는 포맷)
        file_extension = os.path.splitext(audio_file.name)[1]

        if file_extension.lower() not in ALLOWED_AUDIO_EXTENSIONS:
            return Response({'error': f'음원 파일만 업로드할 수 있습니다. 선택한 파일: {audio_file.name}'}, status=status.HTTP_400_BAD_REQUEST)

        # MIME 타입 검사 (2차 방어 - 파일 실제 내용 기반 검증)
        file_header = audio_file.read(2048)
        audio_file.seek(0)
        detected_mime = magic.from_buffer(file_header, mime=True)
        if detected_mime not in ALLOWED_AUDIO_MIME_TYPES:
            return Response({'error': '유효하지 않은 파일 형식입니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # === 2. 파일을 먼저 스토리지에 업로드 (트랜잭션·쿼터 잠금 밖) ===
        # 이전에는 Note.objects.create(audio_file=...)가 트랜잭션 안에 있어
        # 최대 1GB 업로드가 끝날 때까지 쿼터 행 잠금과 DB 커넥션을 점유했고
        # (동시 업로드 몇 개로 커넥션 풀 고갈), 커밋 실패 시 스토리지에
        # 고아 파일이 남아도 지울 로직이 없었다. 업로드를 앞으로 빼고
        # DB 작업은 짧은 트랜잭션으로, 실패 시 방금 올린 파일을 정리한다.
        from .models import note_audio_upload_path
        audio_storage = Note._meta.get_field('audio_file').storage
        saved_name = audio_storage.save(
            note_audio_upload_path(None, audio_file.name), audio_file
        )

        def _cleanup_uploaded_file():
            try:
                audio_storage.delete(saved_name)
            except Exception:
                logger.warning(
                    'note_create: 업로드 정리 실패 — 고아 파일 가능: %s', saved_name,
                    exc_info=True,
                )

        # === 3. 쿼터 검증 및 노트 생성 (짧은 원자적 트랜잭션으로 Race Condition 방지) ===
        try:
            with transaction.atomic():
                # select_for_update()로 해당 사용자의 쿼터 행을 잠금
                quota = UserQuota.objects.select_for_update().filter(user=request.user).first()
                if not quota:
                    # 쿼터가 없으면 생성 (트랜잭션 내에서 안전하게 생성)
                    quota = UserQuota.objects.create(user=request.user)

                # 일일 노트 생성 제한 확인
                can_create, error_msg = quota.can_create_note()
                if not can_create:
                    _cleanup_uploaded_file()
                    return Response({
                        'error': error_msg,
                        'code': 'DAILY_LIMIT_EXCEEDED',
                        'daily_limit': quota.daily_note_limit,
                        'daily_used': quota.daily_notes_created
                    }, status=status.HTTP_429_TOO_MANY_REQUESTS)

                # 스토리지 쿼터 확인
                can_upload, error_msg = quota.can_upload_file(file_size)
                if not can_upload:
                    _cleanup_uploaded_file()
                    return Response({
                        'error': error_msg,
                        'code': 'STORAGE_LIMIT_EXCEEDED',
                        'storage_limit_bytes': quota.storage_limit_bytes,
                        'storage_used_bytes': quota.storage_used_bytes
                    }, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

                # Summary 객체 생성
                summary = Summary.objects.create()

                # Note 객체 생성 (임시 duration=0)
                # audio_file에 이미 저장된 파일명(str)을 지정 — 재업로드 없이 참조만 연결
                note = Note.objects.create(
                    user=request.user,
                    title=title,
                    content={},
                    duration=timedelta(seconds=0),  # 임시값, 아래에서 업데이트
                    is_recording=False,
                    processing_status='pending',
                    summary=summary,
                    audio_file=saved_name,
                    preview='처리 대기 중...',
                    user_description=user_description if user_description else None,
                    user_keywords=user_keywords,
                    file_size=file_size,  # 스토리지 쿼터 추적용
                )

                # 쿼터 사용량 업데이트 (원자적 연산)
                quota.record_note_created(file_size)
        except Exception:
            # DB 실패(롤백) 시 방금 올린 파일이 고아로 남지 않게 정리
            _cleanup_uploaded_file()
            raise

        # 오디오 길이 추출 (mutagen → ffprobe 폴백)
        try:
            from django.conf import settings
            import tempfile
            import subprocess

            def get_duration_with_ffprobe(file_path: str) -> int:
                """FFprobe로 오디오 duration 추출 (mutagen 폴백용)

                FFprobe는 메타데이터만 읽으므로 파일 크기와 무관하게 1-2초 내 완료.
                timeout 60초는 네트워크 파일시스템 등 극단적 케이스 대비.
                """
                try:
                    result = subprocess.run(
                        ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                         '-of', 'default=noprint_wrappers=1:nokey=1', file_path],
                        capture_output=True, text=True, timeout=60
                    )
                    if result.returncode == 0 and result.stdout.strip():
                        duration = float(result.stdout.strip())
                        if duration > 0:
                            return int(duration)
                except Exception as e:
                    logger.warning(f"FFprobe failed: {e}")
                return 0

            duration_seconds = 0

            if settings.USE_S3:
                # S3 스토리지: 파일을 임시로 다운로드하여 메타데이터 추출
                with tempfile.NamedTemporaryFile(suffix=file_extension, delete=True) as tmp_file:
                    for chunk in note.audio_file.chunks():
                        tmp_file.write(chunk)
                    tmp_file.flush()

                    # 1차 시도: mutagen
                    audio_metadata = MutagenFile(tmp_file.name)
                    if audio_metadata and audio_metadata.info and audio_metadata.info.length > 0:
                        duration_seconds = int(audio_metadata.info.length)
                    else:
                        # 2차 시도: ffprobe
                        logger.info(f"Mutagen failed for note {note.id}, trying ffprobe")
                        duration_seconds = get_duration_with_ffprobe(tmp_file.name)
            else:
                # 로컬 스토리지: 직접 경로 접근
                audio_metadata = MutagenFile(note.audio_file.path)
                if audio_metadata and audio_metadata.info and audio_metadata.info.length > 0:
                    duration_seconds = int(audio_metadata.info.length)
                else:
                    logger.info(f"Mutagen failed for note {note.id}, trying ffprobe")
                    duration_seconds = get_duration_with_ffprobe(note.audio_file.path)

            # 최종 검증: 여전히 0이면 기본값 사용
            if duration_seconds <= 0:
                logger.warning(f"Could not extract duration for note {note.id}, using default 3600s")
                duration_seconds = 3600

            note.duration = timedelta(seconds=duration_seconds)
            note.save(update_fields=['duration'])
        except Exception as e:
            import logging
            logging.warning(f"Failed to extract audio duration: {e}")
            duration_seconds = 3600  # 기본값: 1시간 (실패 시 안전한 추정치)

        # 동적 시간 제한 계산
        time_limit = calculate_stt_time_limit(duration_seconds)
        soft_time_limit = int(time_limit * 0.8)  # 80%에서 경고

        # task_id를 미리 생성해 ProcessingTask와 함께 원자적으로 저장하고,
        # 실제 Celery 제출은 transaction.on_commit으로 커밋 이후에만 실행한다.
        # → ProcessingTask 생성이 롤백되면 task도 제출되지 않고(고아 task 방지),
        #   커밋 전 worker가 먼저 실행돼 노트를 못 찾는 레이스도 원천 차단된다.
        #   (send_task 방식 — worker 코드 임포트 불필요)
        task_id = str(uuid.uuid4())
        with transaction.atomic():
            ProcessingTask.objects.create(
                note=note,
                task_type='STT',
                celery_task_id=task_id,
                status='PENDING',
                expires_at=timezone.now() + timedelta(hours=48)
            )
            transaction.on_commit(
                lambda: celery_app.send_task(
                    'gpu_worker.tasks.process_stt',  # task 이름 (문자열)
                    args=[note.id],
                    kwargs={'duration_seconds': duration_seconds},
                    queue='stt_queue',
                    task_id=task_id,                 # 미리 생성한 id로 제출
                    time_limit=time_limit,           # 동적 설정
                    soft_time_limit=soft_time_limit  # 동적 설정
                )
            )

        # 비즈니스 로깅: 노트 생성
        log_resource_event(logger, 'note_created', request, 'note', note.id,
                          action='create', file_size=file_size,
                          duration=duration_seconds, task_id=task_id)

        return Response({
            'status': 'success',
            'note_id': note.id,
            'task_id': task_id,
            'message': '노트가 생성되었습니다.',
        }, status=status.HTTP_201_CREATED)

    except Exception:
        logger.exception(f"note_create failed for user {request.user.id}")
        return Response({'error': '노트 생성 중 오류가 발생했습니다.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def note_delete(request, note_id):
    """단일 노트 삭제 (휴지통으로 이동)"""
    try:
        note = Note.objects.get(id=note_id, user=request.user)
        note.delete()  # 소프트 삭제 (deleted_at 설정)

        # 비즈니스 로깅: 노트 소프트 삭제
        log_resource_event(logger, 'note_soft_deleted', request, 'note', note_id,
                          action='soft_delete')

        return Response({'message': '노트가 휴지통으로 이동되었습니다.'})
    except Note.DoesNotExist:
        return Response({'error': '노트를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def note_delete_multiple(request):
    """여러 노트 삭제 (휴지통으로 이동)"""
    try:
        note_ids = request.data.get('note_ids', [])
        if not note_ids:
            return Response({'error': '삭제할 노트를 선택해주세요.'}, status=status.HTTP_400_BAD_REQUEST)

        # L9: note_ids를 검증한다. 비정수 요소가 섞이면 id__in에서 ValueError로 500이
        # 나던 것을 400으로 명확히 거부하고, 한 요청의 삭제 규모에 상한을 둔다.
        if not isinstance(note_ids, list):
            return Response({'error': '잘못된 요청 형식입니다.'}, status=status.HTTP_400_BAD_REQUEST)
        MAX_BULK_DELETE = 500
        if len(note_ids) > MAX_BULK_DELETE:
            return Response(
                {'error': f'한 번에 최대 {MAX_BULK_DELETE}개까지 삭제할 수 있습니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            note_ids = [int(n) for n in note_ids]
        except (TypeError, ValueError):
            return Response({'error': '잘못된 노트 ID입니다.'}, status=status.HTTP_400_BAD_REQUEST)

        notes = Note.objects.filter(id__in=note_ids, user=request.user)
        count = notes.count()
        deleted_ids = list(notes.values_list('id', flat=True))
        # Soft delete: QuerySet.delete()는 모델의 delete() 메서드를 호출하지 않으므로
        # 직접 deleted_at을 설정하여 휴지통으로 이동
        notes.update(deleted_at=timezone.now())

        # 비즈니스 로깅: 다중 노트 소프트 삭제
        log_resource_event(logger, 'notes_soft_deleted', request, 'note', deleted_ids,
                          action='soft_delete_multiple', count=count)

        return Response({'message': f'{count}개의 노트가 휴지통으로 이동되었습니다.'})
    except Exception:
        logger.exception(f"note_delete_multiple failed for user {request.user.id}")
        return Response({'error': '노트 삭제 중 오류가 발생했습니다.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def play_audio(request, note_id):
    """노트의 오디오 파일 재생 - Django proxy streaming through MinIO"""
    try:
        from django.conf import settings
        from django.http import StreamingHttpResponse, HttpResponse
        from botocore.exceptions import ClientError
        from urllib.parse import quote
        import os
        import re

        # 안전한 파일명 생성 헬퍼 (한글 보존)
        def sanitize_filename(filename: str) -> str:
            """위험한 문자만 제거하고 한글 보존"""
            safe = "".join(
                c for c in filename
                if c.isalnum() or c in (' ', '-', '_') or '\uAC00' <= c <= '\uD7A3'
            ).strip()
            return safe or 'audio'

        note = Note.objects.get(id=note_id, user=request.user)
        if not note.audio_file:
            return Response({'error': '오디오 파일이 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        if settings.USE_S3:
            from .s3_client import get_s3_client

            s3_client = get_s3_client()  # 싱글톤 사용
            bucket = settings.AWS_STORAGE_BUCKET_NAME
            key = note.audio_file.name

            # 1. 파일 메타데이터 확인
            try:
                head = s3_client.head_object(Bucket=bucket, Key=key)
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', '')
                if error_code in ('404', 'NoSuchKey'):
                    return Response({'error': '오디오 파일을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
                logger.error(f"S3 head_object error for note {note_id}: {e}")
                return Response({'error': '오디오 파일 접근 중 오류가 발생했습니다.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            file_size = head['ContentLength']

            # Content-Type 결정
            file_extension = os.path.splitext(key)[1].lower()
            content_type = AUDIO_CONTENT_TYPE_MAP.get(file_extension, head.get('ContentType', 'audio/mpeg'))

            # 2. Range 요청 파싱
            range_header = request.META.get('HTTP_RANGE', '')
            range_start, range_end, status_code = 0, file_size - 1, 200

            if range_header:
                range_match = re.match(r'bytes=(\d*)-(\d*)', range_header)
                if range_match:
                    try:
                        start_str, end_str = range_match.groups()
                        if start_str == '' and end_str:
                            suffix_length = int(end_str)
                            range_start = max(0, file_size - suffix_length)
                        elif start_str:
                            range_start = int(start_str)
                            range_end = int(end_str) if end_str else file_size - 1

                        if range_start >= file_size:
                            response = HttpResponse(status=416)
                            response['Content-Range'] = f'bytes */{file_size}'
                            return response

                        range_end = min(range_end, file_size - 1)
                        status_code = 206
                    except ValueError:
                        range_start, range_end, status_code = 0, file_size - 1, 200

            content_length = range_end - range_start + 1

            # 3. Range DoS 방지: 최소 청크 크기 강제 (64KB)
            MIN_RANGE_SIZE = 64 * 1024
            if content_length < MIN_RANGE_SIZE and content_length < file_size:
                range_end = min(range_start + MIN_RANGE_SIZE - 1, file_size - 1)
                content_length = range_end - range_start + 1

            # 4. 스트리밍 제너레이터 (예외 발생 시 에러 전파)
            streaming_error = [None]  # 클로저에서 에러 상태 공유

            def stream_from_s3():
                CHUNK_SIZE = 64 * 1024  # 64KB
                body = None
                try:
                    s3_response = s3_client.get_object(
                        Bucket=bucket, Key=key,
                        Range=f'bytes={range_start}-{range_end}'
                    )
                    body = s3_response['Body']
                    while True:
                        chunk = body.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        yield chunk
                except ClientError as e:
                    logger.error(f"S3 streaming error for note {note_id}: {e}")
                    streaming_error[0] = e
                    # 빈 응답 대신 에러 표시를 위해 예외 저장
                except GeneratorExit:
                    pass  # 클라이언트 연결 끊김 - 정상 케이스
                finally:
                    if body:
                        try:
                            body.close()
                        except Exception:
                            pass

            # 5. 첫 청크 확인으로 S3 연결 검증
            try:
                generator = stream_from_s3()
                first_chunk = next(generator, None)

                if streaming_error[0] is not None:
                    return Response({'error': '오디오 스트리밍 중 오류가 발생했습니다.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

                if first_chunk is None:
                    return Response({'error': '오디오 파일이 비어있습니다.'}, status=status.HTTP_404_NOT_FOUND)

                def combined_generator():
                    yield first_chunk
                    yield from generator

                response = StreamingHttpResponse(combined_generator(), status=status_code, content_type=content_type)
            except StopIteration:
                return Response({'error': '오디오 파일을 읽을 수 없습니다.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # 6. 응답 헤더 설정
            response['Content-Length'] = str(content_length)
            response['Accept-Ranges'] = 'bytes'
            response['Cache-Control'] = 'private, max-age=3600'

            if status_code == 206:
                response['Content-Range'] = f'bytes {range_start}-{range_end}/{file_size}'

            if request.GET.get('download') == 'true':
                filename = sanitize_filename(note.title or 'audio')
                # RFC 5987 인코딩 (비ASCII 파일명 지원)
                encoded_filename = quote(f"{filename}{file_extension}")
                response['Content-Disposition'] = f"attachment; filename*=UTF-8''{encoded_filename}"

            return response

        else:
            # 로컬 파일 스트리밍
            from django.http import HttpResponse, FileResponse
            import os

            file_path = note.audio_file.path
            if not os.path.exists(file_path):
                return Response({'error': '오디오 파일을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

            file_size = os.path.getsize(file_path)
            file_extension = os.path.splitext(file_path)[1].lower()
            content_type = AUDIO_CONTENT_TYPE_MAP.get(file_extension, 'audio/mpeg')

            # Range 요청 파싱 (S3와 동일한 정규식 방식)
            range_header = request.headers.get('Range', '')
            if range_header:
                range_match = re.match(r'bytes=(\d*)-(\d*)', range_header)
                if range_match:
                    try:
                        start_str, end_str = range_match.groups()
                        if start_str == '' and end_str:
                            suffix_length = int(end_str)
                            range_start = max(0, file_size - suffix_length)
                            range_end = file_size - 1
                        elif start_str:
                            range_start = int(start_str)
                            range_end = int(end_str) if end_str else file_size - 1
                        else:
                            range_start, range_end = 0, file_size - 1

                        if range_start >= file_size:
                            response = HttpResponse(status=416)
                            response['Content-Range'] = f'bytes */{file_size}'
                            return response

                        range_end = min(range_end, file_size - 1)
                        range_size = range_end - range_start + 1

                        # S3 경로와 동일하게 64KB 청크 스트리밍 — 이전에는 요청 구간을
                        # 통째로 read()해서 bytes=0- 요청 한 번에 파일 전체(최대 1GB)가
                        # 힙에 적재됐다(동시 재생 몇 개로 워커 OOM 가능).
                        def _iter_file_range(path, start, length, chunk_size=64 * 1024):
                            with open(path, 'rb') as f:
                                f.seek(start)
                                remaining = length
                                while remaining > 0:
                                    chunk = f.read(min(chunk_size, remaining))
                                    if not chunk:
                                        break
                                    remaining -= len(chunk)
                                    yield chunk

                        from django.http import StreamingHttpResponse
                        response = StreamingHttpResponse(
                            _iter_file_range(file_path, range_start, range_size),
                            status=206, content_type=content_type,
                        )
                        response['Content-Length'] = str(range_size)
                        response['Accept-Ranges'] = 'bytes'
                        response['Content-Range'] = f'bytes {range_start}-{range_end}/{file_size}'
                        return response
                    except (ValueError, IndexError):
                        pass

            response = FileResponse(open(file_path, 'rb'), content_type=content_type)
            response['Content-Length'] = str(file_size)
            response['Accept-Ranges'] = 'bytes'
            return response

    except Note.DoesNotExist:
        return Response({'error': '노트를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"play_audio error for note {note_id}: {e}", exc_info=True)
        return Response({'error': '오디오 재생 중 오류가 발생했습니다.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def retry_expired_note(request, note_id):
    """만료된 노트를 다시 처리 큐에 추가"""
    try:
        import uuid
        from .models import ProcessingTask
        from .utils import get_worker_status
        from celery import current_app as celery_app

        # 상태 변경과 task 기록을 하나의 트랜잭션으로 묶는다. 과거엔 note.save()가
        # 먼저 커밋된 뒤 ProcessingTask.create()가 unique_note_task_type
        # (note, task_type) 제약에 걸려 500이 났고 — 기존 STT task를 CANCELLED로
        # 바꿔도 (note,'STT') 슬롯이 비지 않아 새 행 생성은 항상 충돌했다 —
        # 노트는 'pending'으로 남아 이후 재시도가 400(만료 아님)으로 거부돼
        # 영구 고착됐다. atomic으로 묶고, 새 행 대신 기존 STT 행을 재사용한다.
        with transaction.atomic():
            note = Note.objects.select_for_update().get(id=note_id, user=request.user)

            if note.processing_status != 'expired':
                return Response({
                    'error': '재시도할 수 없는 상태입니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # 워커 상태 확인 (읽기 전용)
            worker_status = get_worker_status()
            if worker_status['status'] == 'OFFLINE':
                return Response({
                    'error': '현재 처리 서버가 오프라인 상태입니다.',
                    'message': '나중에 다시 시도해주세요.'
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            # 상태 초기화
            note.processing_status = 'pending'
            note.error_details = None
            note.preview = '재처리 대기 중...'
            note.save()

            # task_id를 선생성해 ProcessingTask에 먼저 기록하고, 실제 발행은 커밋
            # 이후로 미룬다(note_create와 동일). 과거엔 atomic 내부에서
            # send_task를 호출해 ① 커밋 전 워커가 태스크를 집어 note를 아직 못 보는
            # 레이스, ② 트랜잭션 롤백 시 고아 celery 태스크가 발생할 수 있었다.
            task_id = str(uuid.uuid4())

            # (note, task_type) 유니크 제약 때문에 새 행을 만들면 항상 충돌한다.
            # 기존 STT task 행을 PENDING으로 재초기화한다(없으면 생성).
            ProcessingTask.objects.update_or_create(
                note=note,
                task_type='STT',
                defaults={
                    'celery_task_id': task_id,
                    'status': 'PENDING',
                    'error_message': None,
                    'expires_at': timezone.now() + timedelta(hours=48),
                }
            )

            # 커밋이 확정된 뒤에만 발행한다(선생성 task_id로 결과 조회 일관).
            transaction.on_commit(
                lambda: celery_app.send_task(
                    'gpu_worker.tasks.process_stt',
                    args=[note_id],
                    queue='stt_queue',
                    task_id=task_id,
                )
            )

        return Response({
            'message': '재처리를 시작했습니다.',
            'task_id': task_id
        })

    except Note.DoesNotExist:
        return Response({
            'error': '노트를 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)


# ============================================
# 즐겨찾기 및 휴지통 관련 API 엔드포인트
# ============================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_favorite(request, note_id):
    """노트 즐겨찾기 토글 (분당 30회 제한)"""
    # Rate limit 체크
    error_message = check_favorite_toggle_attempts(request.user.id)
    if error_message:
        return Response({'error': error_message}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    try:
        note = Note.objects.get(id=note_id, user=request.user)
        note.is_favorite = not note.is_favorite
        note.save(update_fields=['is_favorite'])

        # 성공적인 요청 기록
        record_favorite_toggle_attempt(request.user.id)

        return Response({
            'id': note.id,
            'is_favorite': note.is_favorite,
            'message': '즐겨찾기에 추가되었습니다.' if note.is_favorite else '즐겨찾기에서 제거되었습니다.'
        })
    except Note.DoesNotExist:
        return Response({'error': '노트를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def trash_list(request):
    """휴지통에 있는 노트 목록 반환 (서버사이드 검색/정렬/페이지네이션)"""
    # all_objects 매니저를 사용하여 삭제된 노트만 조회
    notes = Note.all_objects.filter(
        user=request.user,
        deleted_at__isnull=False
    ).select_related('summary')

    # 검색 (제목 + 미리보기, case-insensitive, 최대 200자)
    search = request.query_params.get('search', '').strip()[:200]
    if search:
        notes = notes.filter(Q(title__icontains=search) | Q(preview__icontains=search))

    # 정렬 (기본: 삭제일 최신순)
    SORT_MAP = {
        'newest': '-deleted_at',
        'oldest': 'deleted_at',
        'title-asc': 'title',
        'title-desc': '-title',
        'duration-asc': 'duration',
        'duration-desc': '-duration',
    }
    sort = request.query_params.get('sort', 'newest')
    notes = notes.order_by(SORT_MAP.get(sort, '-deleted_at'))

    # 삭제 노트 전체 무제한 직렬화 방지 — note_list와 동일한 페이지네이션 적용
    ALLOWED_PAGE_SIZES = {10, 20, 50}
    try:
        page_size = int(request.query_params.get('page_size', 20))
    except (ValueError, TypeError):
        page_size = 20
    if page_size not in ALLOWED_PAGE_SIZES:
        page_size = 20

    try:
        page_num = max(1, int(request.query_params.get('page', 1)))
    except (ValueError, TypeError):
        page_num = 1

    paginator = Paginator(notes, page_size)
    try:
        page_obj = paginator.page(page_num)
    except EmptyPage:
        page_obj = paginator.page(paginator.num_pages)

    notes_data = []
    for note in page_obj:
        keywords = note.summary.keywords if note.summary else []
        notes_data.append({
            'id': note.id,
            'title': note.title,
            'is_recording': note.is_recording,
            'duration': note.duration.total_seconds() if note.duration else 0,
            'processing_status': note.processing_status,
            'preview': note.preview,
            'created_at': note.created_at.isoformat(),
            'deleted_at': note.deleted_at.isoformat(),
            'keywords': keywords,
        })

    return Response({
        'notes': notes_data,
        'pagination': {
            'current_page': page_obj.number,
            'total_pages': paginator.num_pages,
            'total_count': paginator.count,
            'page_size': page_size,
            'has_next': page_obj.has_next(),
            'has_previous': page_obj.has_previous(),
        }
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def restore_note(request, note_id):
    """휴지통에서 노트 복원 (분당 20회 제한)"""
    # Rate limit 체크
    error_message = check_trash_action_attempts(request.user.id)
    if error_message:
        return Response({'error': error_message}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    try:
        note = Note.all_objects.get(
            id=note_id,
            user=request.user,
            deleted_at__isnull=False
        )
        note.restore()

        # 비즈니스 로깅: 노트 복원
        log_resource_event(logger, 'note_restored', request, 'note', note.id,
                          action='restore')

        # 성공적인 요청 기록
        record_trash_action_attempt(request.user.id)

        return Response({
            'message': '노트가 복원되었습니다.',
            'id': note.id
        })
    except Note.DoesNotExist:
        return Response({'error': '노트를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def permanent_delete(request, note_id):
    """노트 영구 삭제 (분당 20회 제한)"""
    # Rate limit 체크
    error_message = check_trash_action_attempts(request.user.id)
    if error_message:
        return Response({'error': error_message}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    try:
        note = Note.all_objects.get(
            id=note_id,
            user=request.user,
            deleted_at__isnull=False
        )
        # 비즈니스 로깅: 영구 삭제 (삭제 전 로깅)
        log_resource_event(logger, 'note_permanently_deleted', request, 'note', note.id,
                          action='permanent_delete')

        note.hard_delete()

        # 성공적인 요청 기록
        record_trash_action_attempt(request.user.id)

        return Response({'message': '노트가 영구 삭제되었습니다.'})
    except Note.DoesNotExist:
        return Response({'error': '노트를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def empty_trash(request):
    """휴지통 비우기 - 모든 삭제된 노트 영구 삭제 (분당 20회 제한)"""
    # Rate limit 체크
    error_message = check_trash_action_attempts(request.user.id)
    if error_message:
        return Response({'error': error_message}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    deleted_notes = Note.all_objects.filter(
        user=request.user,
        deleted_at__isnull=False
    )
    count = deleted_notes.count()
    deleted_ids = list(deleted_notes.values_list('id', flat=True))

    # 노트별 독립 트랜잭션으로 처리한다.
    # 이전에는 전체를 단일 트랜잭션으로 묶었는데, 노트가 많으면 트랜잭션이
    # 길어져 중간 실패 확률이 커지고, 그때 DB는 전부 롤백돼 되살아나는 반면
    # post_delete 시그널이 지운 오디오 파일은 되돌릴 수 없어 "복원됐지만 재생 불가"
    # 불일치가 남았다. 노트별로 쪼개면 실패 시에도 각 노트는
    # "DB·파일 모두 삭제됨" 또는 "모두 남음" 중 하나의 일관 상태만 가진다.
    # (파일 삭제 자체도 signals.py에서 on_commit 이후로 지연된다)
    # hard_delete()는 Summary(OneToOne) 정리와 post_delete 시그널(쿼터·파일)을
    # 수행하므로 QuerySet 벌크 delete()로 대체하면 안 된다.
    deleted_count = 0
    failed_ids = []
    for nid in deleted_ids:
        try:
            with transaction.atomic():
                note = Note.all_objects.select_for_update().filter(
                    id=nid, user=request.user, deleted_at__isnull=False
                ).first()
                if note is None:
                    continue  # 동시 요청이 먼저 지운 경우
                note.hard_delete()
            deleted_count += 1
        except Exception:
            logger.exception(f"empty_trash: note {nid} 영구 삭제 실패 — 계속 진행")
            failed_ids.append(nid)

    # 비즈니스 로깅: 휴지통 비우기
    log_resource_event(logger, 'trash_emptied', request, 'note', deleted_ids,
                      action='empty_trash', count=deleted_count, failed=len(failed_ids))

    # 성공적인 요청 기록
    record_trash_action_attempt(request.user.id)

    if failed_ids:
        return Response({
            'message': f'{deleted_count}개의 노트가 영구 삭제되었습니다. {len(failed_ids)}개는 실패했습니다 — 다시 시도해주세요.',
            'count': deleted_count,
            'failed_count': len(failed_ids),
        }, status=status.HTTP_207_MULTI_STATUS)

    return Response({'message': f'{deleted_count}개의 노트가 영구 삭제되었습니다.', 'count': deleted_count})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def task_status(request, note_id):
    """Task 처리 상태 조회"""
    try:
        from .models import ProcessingTask

        note = Note.objects.get(id=note_id, user=request.user)
        tasks = ProcessingTask.objects.filter(note=note).order_by('-created_at')

        return Response({
            'note_id': note.id,
            'status': note.processing_status,
            'preview': note.preview,
            'tasks': [
                {
                    'type': task.task_type,
                    'status': task.status,
                    'attempt_count': task.attempt_count,
                    'created_at': task.created_at,
                    'started_at': task.started_at,
                    'completed_at': task.completed_at,
                    # 워커 예외 원문에는 스토리지 엔드포인트·오브젝트 키·서버 경로가
                    # 섞여 있어 그대로 노출하면 내부 구조 정찰 자료가 된다.
                    # 원문은 DB(ProcessingTask.error_message)와 서버 로그로만 확인한다.
                    'error_message': '처리 중 오류가 발생했습니다. 다시 시도해주세요.' if task.error_message else None
                }
                for task in tasks
            ]
        })

    except Note.DoesNotExist:
        return Response({
            'error': '노트를 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)
