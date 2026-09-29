# celery_workers/tasks/stt_tasks.py
"""
STT (Speech-to-Text) Task

GPU 집약적 작업 전용
- Whisper 모델을 사용한 음성 인식
- 화자 분리 (Diarization)
- concurrency=1 권장 (GPU 메모리 충돌 방지)
"""
import os
import torch
from celery.utils.log import get_task_logger
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

# 재시도 예외 타입
from psycopg2 import OperationalError
from requests.exceptions import RequestException, Timeout

# GPU Task 사용 (GPU 전용 모듈)
from celery_workers.gpu.base import GPUTask
from celery_workers.common.base import update_task_status

logger = get_task_logger(__name__)

# Task 시간 제한 설정 (환경변수 또는 기본값)
STT_HARD_TIME_LIMIT = int(os.environ.get('STT_HARD_TIME_LIMIT', 7200))  # 2시간
STT_SOFT_TIME_LIMIT = int(os.environ.get('STT_SOFT_TIME_LIMIT', 3600))  # 1시간

# 파일 다운로드 청크 크기
DOWNLOAD_CHUNK_SIZE = 8192  # 8KB


def _get_celery_app():
    """Celery 앱 가져오기 (lazy import)"""
    from celery_workers.stt_worker import app
    return app


def _register_task():
    """Task 등록을 위한 데코레이터 래퍼"""
    from celery import current_app
    return current_app


# Task 정의 (worker에서 명시적 등록)
class ProcessSTTTask(GPUTask):
    """STT 처리 Task 클래스"""
    name = 'gpu_worker.tasks.process_stt'  # 무중단 배포: 구 이름 유지
    acks_late = True
    reject_on_worker_lost = True
    time_limit = STT_HARD_TIME_LIMIT
    soft_time_limit = STT_SOFT_TIME_LIMIT
    queue = 'stt_queue'
    max_retries = 3

    autoretry_for = (
        OperationalError,
        RequestException,
        Timeout,
        torch.cuda.OutOfMemoryError
    )
    retry_backoff = True
    retry_backoff_max = 1800
    retry_jitter = True

    def run(self, note_id, duration_seconds=None):
        """STT 처리 실행

        Args:
            note_id: 처리할 노트의 ID (양수 정수)
            duration_seconds: 오디오 길이 (초, 선택적)

        Returns:
            dict: 처리 결과 {'status': 'success'|'failed'|'already_processed', 'note_id': int}

        Raises:
            ValueError: 입력 검증 실패 시
        """
        from apps.notes.models import Note, ProcessingTask, NoteSegment
        from celery_workers.gpu.speaker_mapping import (
            assign_speakers_to_segments,
            process_speaker_labels,
        )
        from celery_workers.gpu.utils import (
            get_whisper_model,
            get_diarization_model,
            format_transcription,
            run_diarization,
            load_audio,
        )
        from celery_workers.schemas import STTTaskInput, validate_task_input

        # 입력 검증
        validate_task_input(STTTaskInput, note_id=note_id, duration_seconds=duration_seconds)

        # GPU 메트릭 시작
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()

        logger.info("Starting STT", extra={
            'note_id': note_id,
            'status': 'STARTED'
        })

        audio_path = None
        temp_file_created = False

        try:
            # Task 만료 확인
            task_record = ProcessingTask.objects.filter(
                note_id=note_id,
                task_type='STT'
            ).order_by('-created_at').first()

            if task_record and task_record.expires_at < timezone.now():
                logger.warning(f"[Note ID: {note_id}] Task expired at {task_record.expires_at}")
                return {'status': 'expired', 'note_id': note_id}

            # Note 조회 및 멱등성 체크 (Compare-and-Swap 패턴)
            with transaction.atomic():
                note = Note.objects.select_for_update().get(id=note_id)

                # ProcessingTask도 함께 잠금 (PENDING만 조회)
                active_task = ProcessingTask.objects.select_for_update().filter(
                    note=note,
                    task_type='STT',
                    status='PENDING'
                ).first()

                # 이미 처리 완료된 경우
                if note.processing_status == 'completed':
                    logger.info(f"[Note ID: {note_id}] STT already completed")
                    if active_task:
                        active_task.status = 'SUCCESS'
                        active_task.save()
                    return {'status': 'already_processed', 'note_id': note_id}

                # Race Condition 방지: 원자적 상태 전환 (Compare-and-Swap)
                rows_updated = Note.objects.filter(
                    id=note_id,
                    processing_status='pending'
                ).update(
                    processing_status='processing',
                    processing_started_at=timezone.now(),
                    preview='음성 인식 중...'
                )

                if rows_updated == 0:
                    logger.warning(f"[Note ID: {note_id}] Already being processed by another worker")
                    return {'status': 'already_running', 'note_id': note_id}

                note.refresh_from_db()

                # Task 상태 업데이트
                if active_task:
                    active_task.status = 'PROCESSING'
                    active_task.celery_task_id = self.request.id
                    active_task.started_at = timezone.now()
                    active_task.save()

            # 오디오 파일 경로 (MinIO 지원)
            self.update_state(state='PROGRESS', meta={'progress': 10, 'status': '오디오 파일 확인 중'})

            try:
                from django.conf import settings
                import tempfile

                if settings.USE_S3:
                    # MinIO에서 임시 파일로 다운로드 (청크 단위 스트리밍)
                    logger.info(f"[Note ID: {note_id}] Downloading audio from MinIO")
                    ext = os.path.splitext(note.audio_file.name)[1]
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)

                    with note.audio_file.open('rb') as remote_file:
                        for chunk in iter(lambda: remote_file.read(DOWNLOAD_CHUNK_SIZE), b''):
                            temp_file.write(chunk)

                    temp_file.close()
                    audio_path = temp_file.name
                    temp_file_created = True
                    logger.info(f"[Note ID: {note_id}] Downloaded to: {audio_path}")
                else:
                    audio_path = note.audio_file.path
                    logger.info(f"[Note ID: {note_id}] Audio file path: {audio_path}")

            except Exception as e:
                logger.error(f"[Note ID: {note_id}] Audio file not found: {e}")
                raise FileNotFoundError(f"오디오 파일을 찾을 수 없음: {e}")

            # 오디오 디코딩 (1회만 수행 - Whisper와 pyannote에서 메모리 공유)
            self.update_state(state='PROGRESS', meta={'progress': 20, 'status': '오디오 디코딩 중'})
            logger.info(f"[Note ID: {note_id}] Decoding audio file (single decode for both Whisper and pyannote)")
            audio_np = load_audio(audio_path, sampling_rate=16000)

            # Whisper 모델 로드
            self.update_state(state='PROGRESS', meta={'progress': 30, 'status': 'AI 모델 로딩 중'})
            model = get_whisper_model()

            # STT 처리 (메모리 기반 오디오 사용)
            self.update_state(state='PROGRESS', meta={'progress': 50, 'status': '음성 인식 처리 중'})
            logger.info(f"[Note ID: {note_id}] Starting Whisper transcription (in-memory audio)")

            segments, info = model.transcribe(
                audio_np,
                word_timestamps=True,
                language="ko",
                condition_on_previous_text=False,
                vad_filter=True
            )

            formatted_output = format_transcription(segments, info)

            # 화자 분리 (Diarization) - pyannote.audio 4.x (동일 메모리 오디오 재사용)
            self.update_state(state='PROGRESS', meta={'progress': 75, 'status': '화자 분리 중'})
            logger.info(f"[Note ID: {note_id}] Starting speaker diarization (in-memory audio)")

            try:
                diarize_pipeline = get_diarization_model()

                # pyannote.audio Pipeline 실행 (메모리 기반 오디오 사용)
                diarization_result = run_diarization(audio_np, diarize_pipeline)

                # 화자 분리 결과를 전사 결과에 매핑
                # community-1 모델의 exclusive_speaker_diarization 자동 활용
                use_exclusive = os.environ.get('USE_EXCLUSIVE_DIARIZATION', 'true').lower() == 'true'
                result = assign_speakers_to_segments(
                    diarization_result,
                    formatted_output,
                    use_exclusive=use_exclusive
                )

                # 화자 레이블을 ID 형식으로 변환하고 스피커 딕셔너리 생성
                result, speakers_dict = process_speaker_labels(result)

                logger.info(f"[Note ID: {note_id}] Diarization completed successfully with {len(speakers_dict)} speakers")

            except Exception as e:
                logger.error(f"[Note ID: {note_id}] Diarization failed: {type(e).__name__}: {str(e)}", exc_info=True)
                result = formatted_output
                result['segments'] = [{'speaker': 'sp_0', **seg} for seg in result.get('segments', [])]
                speakers_dict = {'sp_0': {'name': '참석자1'}}

            # DB 업데이트 및 Summary task 발행 (원자적 처리)
            self.update_state(state='PROGRESS', meta={'progress': 90, 'status': '결과 저장 중'})

            with transaction.atomic():
                note = Note.objects.select_for_update().get(id=note_id)
                note.content = result
                note.speakers = speakers_dict  # 스피커 메타데이터 저장
                note.processing_status = 'pending'  # Summary 대기
                note.preview = '내용 요약 대기 중...'
                note.save()

                # NoteSegment 생성
                segments_data = result.get('segments', [])
                if segments_data:
                    logger.info(f"[Note ID: {note_id}] Creating {len(segments_data)} NoteSegment records")
                    NoteSegment.objects.filter(stt_id=note).delete()

                    segments_to_create = []
                    for idx, seg in enumerate(segments_data, start=1):
                        segments_to_create.append(NoteSegment(
                            start=seg.get('start', 0.0),
                            end=seg.get('end', 0.0),
                            idx=idx,
                            speaker=seg.get('speaker', 'sp_0'),  # ID 형식 (sp_0, sp_1, ...)
                            text=seg.get('text', ''),
                            words=seg.get('words', []),
                            stt_id=note
                        ))

                    NoteSegment.objects.bulk_create(segments_to_create)
                    logger.info(f"[Note ID: {note_id}] Successfully created {len(segments_to_create)} NoteSegment records")
                else:
                    logger.warning(f"[Note ID: {note_id}] No segments found in STT result")

                # STT Task 완료 표시
                update_task_status(note_id, 'STT', 'SUCCESS', self.request.id)

                # GPU 메트릭 로깅
                if torch.cuda.is_available():
                    peak_mem = torch.cuda.max_memory_allocated() / 1024**2
                    logger.info("STT completed", extra={
                        'note_id': note_id,
                        'gpu_memory_peak_mb': round(peak_mem, 1),
                        'status': 'SUCCESS'
                    })

                logger.info(f"[Note ID: {note_id}] STT processing completed successfully")

                # Summary Task 발행
                try:
                    from celery_workers.tasks.summary_tasks import ProcessSummaryTask

                    summary_task = ProcessSummaryTask()
                    summary_result = summary_task.apply_async(
                        args=[note_id],
                        queue='summary_queue'
                    )

                    task, created = ProcessingTask.objects.get_or_create(
                        note=note,
                        task_type='SUMMARY',
                        defaults={
                            'celery_task_id': summary_result.id,
                            'status': 'PENDING',
                            'expires_at': timezone.now() + timedelta(hours=48)
                        }
                    )

                    if not created:
                        task.celery_task_id = summary_result.id
                        task.status = 'PENDING'
                        task.expires_at = timezone.now() + timedelta(hours=48)
                        task.save(update_fields=['celery_task_id', 'status', 'expires_at'])

                except Exception as e:
                    logger.error(f"[Note ID: {note_id}] Failed to queue summary task: {e}")
                    raise

            return {'status': 'success', 'note_id': note_id}

        except FileNotFoundError as e:
            logger.error("STT failed - file not found", extra={
                'note_id': note_id,
                'error_type': 'FileNotFoundError',
                'status': 'FAILED'
            })

            with transaction.atomic():
                note = Note.objects.select_for_update().get(id=note_id)
                note.processing_status = 'failed'
                note.error_details = {
                    'reason': 'file_not_found',
                    'message': str(e)
                }
                note.preview = '파일을 찾을 수 없습니다.'
                note.save()

            update_task_status(note_id, 'STT', 'FAILED', self.request.id, str(e))
            return {'status': 'failed', 'error': 'file_not_found'}

        except Exception as e:
            logger.error("STT failed", extra={
                'note_id': note_id,
                'error_type': type(e).__name__,
                'status': 'FAILED'
            }, exc_info=True)

            with transaction.atomic():
                note = Note.objects.select_for_update().get(id=note_id)
                note.processing_status = 'pending'
                note.preview = '재시도 대기 중...'
                note.save()

            update_task_status(note_id, 'STT', 'RETRY', self.request.id, str(e))
            raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))

        finally:
            # MinIO 임시 파일 정리
            if temp_file_created and audio_path and os.path.exists(audio_path):
                try:
                    os.unlink(audio_path)
                    logger.info(f"[Note ID: {note_id}] Cleaned up temp file: {audio_path}")
                except Exception as e:
                    logger.warning(f"[Note ID: {note_id}] Failed to cleanup temp file: {e}")


# Task 인스턴스 (backward compatibility)
process_stt = ProcessSTTTask()
