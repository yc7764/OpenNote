from django.utils import timezone
from django.core.cache import cache
from datetime import timedelta


def calculate_stt_time_limit(duration_seconds: int) -> int:
    """
    STT Task 시간 제한 계산 (오디오 길이 기반)

    Args:
        duration_seconds: 오디오 길이 (초)

    Returns:
        time_limit: Task 시간 제한 (초)

    공식: (duration * 2) + 300 (5분 여유)

    예시:
        5분 (300초) → 900초 (15분)
        30분 (1800초) → 3900초 (65분)
        1시간 (3600초) → 7500초 (2시간 5분)
        3시간 (10800초) → 21900초 (6시간 5분)

    계수 2를 사용하는 이유:
    - Whisper 실시간 비율: 1x (이상적)
    - 실제 환경: 1.5x (GPU 부하, I/O)
    - 안전 마진: 2x (예상치 못한 지연 대비)
    """
    # 기본 공식: duration * 2 + 300 (5분 여유)
    base_limit = (duration_seconds * 2) + 300

    # 최소값: 10분 (짧은 오디오도 최소 시간 보장)
    min_limit = 600

    # 최대값: 14시간 (6시간 오디오 처리 가능)
    max_limit = 50400

    return max(min_limit, min(base_limit, max_limit))


def calculate_summary_time_limit(duration_seconds: int) -> int:
    """
    Summary Task 시간 제한 계산

    Summary는 오디오 길이와 거의 무관 (Mistral API 호출 시간)
    안전하게 고정값 사용
    """
    return 600  # 10분 고정


def get_worker_status():
    """현재 워커 상태 및 대기 시간 계산"""
    from .models import WorkerHeartbeat

    # 캐싱 (1분)
    cache_key = 'worker_status_v1'
    cached = cache.get(cache_key)
    if cached:
        return cached

    # 최근 5분 이내 하트비트
    recent = timezone.now() - timedelta(minutes=5)
    online_workers = WorkerHeartbeat.objects.filter(
        last_heartbeat__gte=recent,
        worker_type='STT'
    )

    if not online_workers.exists():
        result = {
            'status': 'OFFLINE',
            'message': '⚠️ 현재 처리 서버가 일시적으로 사용 불가합니다.',
            'detail': '작업이 큐에 저장되었으며, 서버 복구 시 자동으로 처리됩니다.',
            'queue_depth': 0,
            'max_wait_time': '48시간'
        }
    else:
        worker = online_workers.first()
        queue_depth = worker.queue_depth or 0

        result = {
            'status': 'ONLINE',
            'message': f'현재 {queue_depth}개 작업이 대기 중입니다.' if queue_depth > 0 else None,
            'queue_depth': queue_depth
        }

    cache.set(cache_key, result, timeout=60)
    return result
