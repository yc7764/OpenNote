# celery_workers/tasks/summary_tasks.py
"""
Summary (요약 생성) Task

CPU/API 집약적 작업 전용
- 다중 LLM API 폴백 지원 (Groq, Gemini, Mistral)
- concurrency=4 권장 (I/O 병렬 처리)
"""
import copy

from celery.utils.log import get_task_logger
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

# 재시도 예외 타입
from psycopg2 import OperationalError
from requests.exceptions import RequestException, Timeout

# CPU Task 사용 (GPU 의존성 제거)
from celery_workers.common.base import CPUTask, update_task_status

logger = get_task_logger(__name__)


class ProcessSummaryTask(CPUTask):
    """Summary 처리 Task 클래스"""
    name = 'gpu_worker.tasks.process_summary'  # 무중단 배포: 구 이름 유지
    acks_late = True
    reject_on_worker_lost = True
    time_limit = 600       # 10분
    soft_time_limit = 540  # 9분
    queue = 'summary_queue'
    max_retries = 3

    autoretry_for = (
        OperationalError,
        RequestException,
        Timeout
    )
    retry_backoff = True
    retry_backoff_max = 1800
    retry_jitter = True

    def run(self, note_id):
        """요약 처리 실행 (STT 완료 후 자동 실행)

        Args:
            note_id: 처리할 노트의 ID (양수 정수)

        Returns:
            dict: 처리 결과 {'status': 'success'|'failed'|'already_processed'}

        Raises:
            ValueError: 입력 검증 실패 시
        """
        from apps.notes.models import Note, ProcessingTask, SummarySection
        from celery_workers.common.utils import call_summary_api, parse_summary_result
        from celery_workers.schemas import SummaryTaskInput, validate_task_input

        # 입력 검증
        validate_task_input(SummaryTaskInput, note_id=note_id)

        logger.info("Starting Summary", extra={
            'note_id': note_id,
            'status': 'STARTED'
        })

        try:
            # Task 생성 및 상태 업데이트
            with transaction.atomic():
                note = Note.objects.select_for_update().get(id=note_id)

                # ProcessingTask 생성 (없으면)
                task, created = ProcessingTask.objects.get_or_create(
                    note=note,
                    task_type='SUMMARY',
                    defaults={
                        'celery_task_id': self.request.id,
                        'status': 'PROCESSING',
                        'expires_at': timezone.now() + timedelta(hours=48)
                    }
                )

                if not created:
                    task.status = 'PROCESSING'
                    task.celery_task_id = self.request.id
                    task.started_at = timezone.now()
                    task.save()

                # 멱등성 체크
                if note.processing_status == 'completed':
                    logger.info(f"[Note ID: {note_id}] Summary already processed")
                    return {'status': 'already_processed'}

                # STT 완료 확인
                if not note.content or note.content == {}:
                    logger.error(f"[Note ID: {note_id}] STT content missing")
                    raise ValueError("STT content missing")

                # 상태 업데이트
                note.processing_status = 'summarizing'
                note.preview = '내용 요약 중...'
                note.save()

            # LLM API 호출 (폴백 체인: Groq → Gemini → Mistral)
            self.update_state(state='PROGRESS', meta={'progress': 30, 'status': 'AI 요약 생성 중'})

            # speaker ID(sp_0 등)를 display name(참석자1 등)으로 변환하여 AI에 전달
            content_for_summary = copy.deepcopy(note.content)
            speakers = getattr(note, 'speakers', None) or {}
            if speakers:
                for seg in content_for_summary.get('segments', []):
                    sp_id = seg.get('speaker', '')
                    if sp_id in speakers:
                        seg['speaker'] = speakers[sp_id].get('name', sp_id)

            is_success, summary_result = call_summary_api(
                content_for_summary,
                note.user_description,
                note.user_keywords
            )

            if not is_success:
                status_code, error_text = summary_result
                raise Exception(f"Summary API failed: {status_code} - {error_text}")

            # 결과 파싱
            self.update_state(state='PROGRESS', meta={'progress': 60, 'status': '결과 분석 중'})

            main_topic, keywords, next_actions, sections = parse_summary_result(summary_result)

            # DB 업데이트
            self.update_state(state='PROGRESS', meta={'progress': 80, 'status': '결과 저장 중'})

            with transaction.atomic():
                note = Note.objects.select_for_update().get(id=note_id)
                summary = note.summary

                # Summary 업데이트
                summary.main_topic = main_topic
                summary.keywords = keywords
                summary.next_actions = next_actions
                summary.save()

                # 기존 섹션 삭제 후 재생성
                summary.sections.all().delete()

                # 새 섹션 생성
                for section in sections:
                    SummarySection.objects.create(
                        summary=summary,
                        title=section['title'],
                        start_time=timedelta(seconds=section['start_time']),
                        end_time=timedelta(seconds=section['end_time']),
                        content=section['content'],
                        order=section['order']
                    )

                # Note 상태 업데이트
                note.processing_status = 'completed'
                note.processing_completed_at = timezone.now()
                note.preview = main_topic[:100] if main_topic else '요약 완료'
                note.save()

            # Task 상태 업데이트
            update_task_status(note_id, 'SUMMARY', 'SUCCESS', self.request.id)

            logger.info("Summary completed", extra={
                'note_id': note_id,
                'status': 'SUCCESS'
            })

            return {'status': 'success', 'note_id': note_id}

        except Note.DoesNotExist:
            logger.error("Summary failed - note not found", extra={
                'note_id': note_id,
                'error_type': 'NoteDoesNotExist',
                'status': 'FAILED'
            })
            update_task_status(note_id, 'SUMMARY', 'FAILED', self.request.id, 'note_not_found')
            return {'status': 'failed', 'error': 'note_not_found'}

        except Exception as e:
            logger.error("Summary failed", extra={
                'note_id': note_id,
                'error_type': type(e).__name__,
                'status': 'FAILED'
            }, exc_info=True)
            update_task_status(note_id, 'SUMMARY', 'RETRY', self.request.id, str(e))
            raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))


# Task 인스턴스 (backward compatibility)
process_summary = ProcessSummaryTask()
