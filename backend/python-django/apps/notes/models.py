from django.db import models
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.utils import timezone
import logging
import os
import uuid
from datetime import timedelta

logger = logging.getLogger(__name__)

class Summary(models.Model):
    keywords = ArrayField(models.CharField(max_length=100), blank=True, default=list)  # 주요 키워드 배열
    main_topic = models.TextField(blank=True, null=True)  # 주요 주제
    next_actions = models.TextField(blank=True, null=True)  # 다음 할일
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Summary created at {self.created_at}"

    class Meta:
        verbose_name_plural = "Summaries"

class SummarySection(models.Model):
    summary = models.ForeignKey(Summary, on_delete=models.CASCADE, related_name='sections')
    title = models.CharField(max_length=200)  # 구간 제목
    start_time = models.DurationField()  # 구간 시작 시간
    end_time = models.DurationField()  # 구간 종료 시간
    content = models.TextField()  # 구간 요약 내용
    order = models.IntegerField(default=0)  # 구간 순서

    class Meta:
        ordering = ['order', 'start_time']

    def __str__(self):
        return f"{self.title} ({self.start_time} - {self.end_time})"

def note_audio_upload_path(instance: "Note", filename: str) -> str:
    """노트 오디오 업로드 경로 및 고유 파일명 생성"""
    # 원본 확장자 유지
    _, ext = os.path.splitext(filename)
    # UUID 기반 고유 파일명
    unique_name = f"{uuid.uuid4().hex}{ext.lower()}"
    # 날짜 기반 하위 디렉터리
    return timezone.now().strftime(f"notes/audio/%Y/%m/%d/{unique_name}")


class ProcessingTask(models.Model):
    """AI 처리 Task 추적 테이블"""

    # 기본 정보
    id = models.BigAutoField(primary_key=True)
    note = models.ForeignKey('Note', on_delete=models.CASCADE, related_name='processing_tasks')
    task_type = models.CharField(
        max_length=20,
        choices=[('STT', 'STT 처리'), ('SUMMARY', '요약 처리')]
    )
    celery_task_id = models.UUIDField(null=True, blank=True, db_index=True)

    # 상태 관리
    status = models.CharField(
        max_length=20,
        choices=[
            ('PENDING', '대기 중'),
            ('PROCESSING', '처리 중'),
            ('SUCCESS', '성공'),
            ('FAILED', '실패'),
            ('RETRY', '재시도'),
            ('EXPIRED', '만료'),
            ('CANCELLED', '취소')
        ],
        default='PENDING',
        db_index=True
    )

    # 재시도 관리
    attempt_count = models.IntegerField(default=0)
    max_retries = models.IntegerField(default=3)

    # 에러 추적
    error_message = models.TextField(null=True, blank=True)
    error_history = models.JSONField(default=list, blank=True)

    # 메타데이터
    metadata = models.JSONField(default=dict, blank=True)

    # 타임스탬프
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(help_text='48시간 후 자동 만료')

    class Meta:
        db_table = 'smartnote_processingtask'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['note', 'task_type']),
            models.Index(fields=['celery_task_id']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['note', 'task_type'],
                name='unique_note_task_type'
            ),
        ]

    def __str__(self):
        return f"{self.task_type} - {self.note.title} ({self.status})"

    def add_error(self, error_msg, traceback_str=None):
        """에러 히스토리 추가"""
        self.error_history.append({
            'timestamp': timezone.now().isoformat(),
            'error': error_msg,
            'traceback': traceback_str,
            'attempt': self.attempt_count
        })
        self.error_message = error_msg
        self.save(update_fields=['error_message', 'error_history'])


class WorkerHeartbeat(models.Model):
    """워커 Health Monitoring 테이블"""

    # 워커 식별
    worker_id = models.CharField(max_length=100, unique=True, primary_key=True)
    worker_type = models.CharField(
        max_length=20,
        choices=[('STT', 'STT 워커'), ('SUMMARY', '요약 워커')]
    )
    hostname = models.CharField(max_length=255)

    # 상태
    status = models.CharField(
        max_length=20,
        choices=[
            ('ONLINE', '온라인'),
            ('OFFLINE', '오프라인'),
            ('DEGRADED', '성능 저하')
        ],
        default='ONLINE'
    )

    # 메트릭
    last_heartbeat = models.DateTimeField(auto_now=True, db_index=True)
    gpu_utilization = models.FloatField(null=True, blank=True, help_text='GPU 사용률 (%)')
    memory_usage = models.FloatField(null=True, blank=True, help_text='메모리 사용률 (%)')
    queue_depth = models.IntegerField(default=0)
    processed_count_24h = models.IntegerField(default=0)
    avg_processing_time = models.FloatField(null=True, blank=True, help_text='평균 처리 시간 (초)')

    # 메타데이터
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'smartnote_workerheartbeat'
        indexes = [
            models.Index(fields=['status', 'last_heartbeat']),
            models.Index(fields=['worker_type', 'status']),
        ]

    def __str__(self):
        return f"{self.worker_id} ({self.status})"

    def is_online(self):
        """5분 이내 하트비트 있으면 온라인"""
        threshold = timezone.now() - timedelta(minutes=5)
        return self.last_heartbeat >= threshold and self.status == 'ONLINE'


class NoteManager(models.Manager):
    """소프트 삭제된 노트를 기본적으로 제외하는 커스텀 매니저"""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)

    def with_deleted(self):
        """삭제된 노트 포함 전체 조회"""
        return super().get_queryset()

    def deleted_only(self):
        """삭제된 노트만 조회"""
        return super().get_queryset().filter(deleted_at__isnull=False)

    def favorites(self):
        """즐겨찾기 노트만 조회"""
        return self.get_queryset().filter(is_favorite=True)


class Note(models.Model):
    PROCESSING_STATUS_CHOICES = [
        ('uploaded', '업로드 완료'),
        ('pending', '처리 대기 중'),
        ('processing', '음성 인식 중'),
        ('summarizing', '내용 요약 중'),
        ('completed', '처리 완료'),
        ('failed', '처리 실패'),
        ('expired', '처리 만료'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=20)
    content = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    duration = models.DurationField(default=timedelta(seconds=0))  # 녹음 길이(초)
    is_recording = models.BooleanField(default=False)  # 녹음 파일 여부
    processing_status = models.CharField(
        max_length=20,
        choices=PROCESSING_STATUS_CHOICES,
        default='processing'
    )  # 처리 상태
    preview = models.TextField(blank=True, null=True, default='처리 대기 중...')  # 미리보기 텍스트
    summary = models.OneToOneField(Summary, on_delete=models.CASCADE, null=True, blank=True, related_name='note')  # Summary와 1:1 관계
    audio_file = models.FileField(upload_to=note_audio_upload_path, blank=True)

    # Celery 처리 추적 필드
    processing_started_at = models.DateTimeField(null=True, blank=True)
    processing_completed_at = models.DateTimeField(null=True, blank=True)
    error_details = models.JSONField(null=True, blank=True)

    # 즐겨찾기 및 휴지통 필드
    is_favorite = models.BooleanField(default=False, db_index=True, help_text="즐겨찾기 여부")
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True, help_text="소프트 삭제 시점 (NULL이면 미삭제)")

    # 사용자 제공 메타데이터 (AI 요약 품질 향상용)
    user_description = models.TextField(blank=True, null=True, help_text="사용자가 입력한 노트 설명")
    user_keywords = ArrayField(
        models.CharField(max_length=50),
        blank=True,
        default=list,
        help_text="사용자가 입력한 키워드 목록"
    )

    # 파일 크기 추적 (스토리지 쿼터용)
    file_size = models.BigIntegerField(default=0, help_text="오디오 파일 크기 (바이트)")

    # 스피커 메타데이터 (화자 관리용)
    speakers = models.JSONField(
        default=dict,
        blank=True,
        help_text='스피커 정보: {"sp_0": {"name": "참석자1"}, "sp_1": {"name": "참석자2"}, ...}'
    )

    # 샘플 노트 여부
    is_sample = models.BooleanField(
        default=False,
        db_index=True,
        help_text="시스템이 자동 생성한 샘플 노트 여부"
    )

    # 커스텀 매니저
    objects = NoteManager()
    all_objects = models.Manager()  # 삭제된 노트 포함 전체 조회용

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', 'is_favorite'], name='notes_note_user_fav_idx'),
            models.Index(fields=['user', 'deleted_at'], name='notes_note_user_del_idx'),
            # 서버사이드 페이지네이션: 상태 필터링 쿼리 성능 최적화
            models.Index(fields=['user', 'processing_status'], name='notes_note_user_status_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user'],
                condition=models.Q(is_sample=True, deleted_at__isnull=True),
                name='unique_sample_note_per_user'
            ),
        ]

    def __str__(self):
        return f"{self.title} - {self.user.username}"

    def delete(self, *args, hard_delete=False, **kwargs):
        """
        노트 삭제
        - hard_delete=False (기본): 소프트 삭제 (휴지통으로 이동)
        - hard_delete=True: 영구 삭제 (DB에서 완전 삭제)
        """
        if hard_delete:
            # 영구 삭제: Summary가 있으면 먼저 삭제
            if self.summary:
                summary = self.summary
                self.summary = None
                self.save()
                summary.delete()
            super().delete(*args, **kwargs)
        else:
            # 소프트 삭제: deleted_at 타임스탬프 설정
            self.deleted_at = timezone.now()
            self.save(update_fields=['deleted_at'])

    def restore(self):
        """휴지통에서 노트 복원"""
        self.deleted_at = None
        self.save(update_fields=['deleted_at'])

    def hard_delete(self):
        """노트 영구 삭제"""
        self.delete(hard_delete=True)


class NoteSegment(models.Model):
    """
    음성 세그먼트 정보를 저장하는 모델
    각 세그먼트는 발화자, 시간, 텍스트 정보를 포함
    """
    segment_id = models.BigAutoField(primary_key=True)
    start = models.FloatField(null=False, help_text="segment 시작 시간 (초)")
    end = models.FloatField(null=False, help_text="segment 종료 시간 (초)")
    idx = models.IntegerField(default=1, help_text="segment 순서")
    speaker = models.CharField(max_length=255, null=False, help_text="발화자")
    text = models.TextField(default="", blank=True, help_text="발화 문장")
    words = models.JSONField(default=list, help_text="단어별 상세 정보 [{word, start, end, score, speaker}, ...]")
    stt_id = models.ForeignKey(
        Note,
        on_delete=models.CASCADE,
        null=False,
        related_name='segments',
        db_column='stt_id',
        help_text="STT 참조 (Note 테이블)"
    )
    created_at = models.DateTimeField(auto_now_add=True, help_text="생성일시")
    updated_at = models.DateTimeField(null=True, blank=True, help_text="수정일시")
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_segments',
        help_text="수정자"
    )

    class Meta:
        db_table = 'notes_note_segment'
        ordering = ['stt_id', 'idx']
        indexes = [
            models.Index(fields=['stt_id', 'idx']),
            models.Index(fields=['stt_id', 'speaker']),
        ]
        verbose_name = "노트 세그먼트"
        verbose_name_plural = "노트 세그먼트"

    def __str__(self):
        return f"Segment {self.idx} - {self.speaker} ({self.start:.2f}s - {self.end:.2f}s)"

    def save(self, *args, **kwargs):
        # 수정 시 updated_at 자동 갱신
        if self.pk:
            self.updated_at = timezone.now()
        super().save(*args, **kwargs)


class NoteSegmentHistory(models.Model):
    """
    노트 세그먼트 변경 이력을 저장하는 모델
    세그먼트 수정 시 이전 내용을 보존
    """
    seg_hist_id = models.BigAutoField(primary_key=True)
    text = models.TextField(default="", blank=True, help_text="변경 전 발화 문장")
    words = models.JSONField(default=list, help_text="변경 전 단어별 상세 정보 [{word, start, end, score, speaker}, ...]")
    segment_id = models.ForeignKey(
        NoteSegment,
        on_delete=models.CASCADE,
        null=False,
        related_name='history',
        db_column='segment_id',
        help_text="세그먼트 참조"
    )
    changed_at = models.DateTimeField(auto_now_add=True, help_text="변경일시")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=False,
        related_name='segment_changes',
        db_column='changed_by',
        help_text="변경자"
    )

    class Meta:
        db_table = 'notes_note_segment_history'
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['segment_id', '-changed_at']),
            models.Index(fields=['changed_by', '-changed_at']),
        ]
        verbose_name = "노트 세그먼트 이력"
        verbose_name_plural = "노트 세그먼트 이력"

    def __str__(self):
        return f"History {self.seg_hist_id} - Segment {self.segment_id_id} at {self.changed_at}"


class NoteSummaryHistory(models.Model):
    """
    노트 요약 변경 이력을 저장하는 모델
    요약 수정 시 이전 내용을 보존
    """
    summary_hist_id = models.BigAutoField(primary_key=True)
    keywords = ArrayField(
        models.CharField(max_length=100),
        default=list,
        blank=True,
        help_text="변경 전 키워드 목록"
    )
    main_topic = models.TextField(null=True, blank=True, help_text="변경 전 주요 주제")
    next_actions = models.TextField(null=True, blank=True, help_text="변경 전 다음 액션 아이템")
    summary_id = models.ForeignKey(
        Summary,
        on_delete=models.CASCADE,
        null=False,
        related_name='history',
        db_column='summary_id',
        help_text="요약 참조"
    )
    changed_at = models.DateTimeField(auto_now_add=True, help_text="변경일시")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=False,
        related_name='summary_changes',
        db_column='changed_by',
        help_text="변경자"
    )

    class Meta:
        db_table = 'notes_note_summary_history'
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['summary_id', '-changed_at']),
            models.Index(fields=['changed_by', '-changed_at']),
        ]
        verbose_name = "노트 요약 이력"
        verbose_name_plural = "노트 요약 이력"

    def __str__(self):
        return f"Summary History {self.summary_hist_id} at {self.changed_at}"


class SummarySectionHistory(models.Model):
    """
    요약 섹션 변경 이력을 저장하는 모델
    섹션 수정 시 이전 내용을 보존
    """
    sum_sec_hist_id = models.BigAutoField(primary_key=True)
    title = models.CharField(max_length=200, null=False, help_text="섹션 제목")
    content = models.TextField(null=False, help_text="섹션 내용")
    order = models.IntegerField(default=0, help_text="정렬 순서")
    sum_sec_id = models.ForeignKey(
        SummarySection,
        on_delete=models.CASCADE,
        null=False,
        related_name='history',
        db_column='sum_sec_id',
        help_text="요약 섹션 참조"
    )
    changed_at = models.DateTimeField(auto_now_add=True, help_text="변경일시")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=False,
        related_name='section_changes',
        db_column='changed_by',
        help_text="변경자"
    )

    class Meta:
        db_table = 'notes_summarysection_history'
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['sum_sec_id', '-changed_at']),
            models.Index(fields=['changed_by', '-changed_at']),
        ]
        verbose_name = "요약 섹션 이력"
        verbose_name_plural = "요약 섹션 이력"

    def __str__(self):
        return f"Section History {self.sum_sec_hist_id} - {self.title} at {self.changed_at}"


# 샘플 오디오 공유 경로 — post_delete 시그널(apps/notes/signals.py)에서 삭제 보호에 사용
SAMPLE_AUDIO_PREFIX = 'notes/audio/sample/'