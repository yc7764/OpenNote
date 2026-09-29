# celery_workers/gpu/__init__.py
"""
GPU 전용 모듈

STT Worker에서만 사용되는 GPU 의존성 모듈
- torch, faster_whisper, pyannote.audio 등 GPU 라이브러리 필요
- pyannote.audio 4.x: community-1 모델 지원, exclusive_speaker_diarization
"""
from .base import GPUTask
from .signals import (
    cleanup_gpu_memory,
    cleanup_database_connections,
    register_shutdown_handlers,
    worker_ready_handler,
    worker_shutdown_handler,
    is_shutdown_requested,
)
from .utils import (
    ModelManager,
    model_manager,
    get_whisper_model,
    get_diarization_model,
    format_transcription,
    run_diarization,
    get_gpu_utilization,
    calculate_stt_time_limit,
)
# 화자 매핑 로직 (whisperx 의존성 제거, 별도 모듈로 분리)
from .speaker_mapping import (
    assign_speakers_to_segments,
    process_speaker_labels,
    get_speaker_timeline,
    get_speaker_statistics,
)

__all__ = [
    # Base
    'GPUTask',
    # Signals
    'cleanup_gpu_memory',
    'cleanup_database_connections',
    'register_shutdown_handlers',
    'worker_ready_handler',
    'worker_shutdown_handler',
    'is_shutdown_requested',
    # Utils - Model Management
    'ModelManager',
    'model_manager',
    'get_whisper_model',
    'get_diarization_model',
    'format_transcription',
    'run_diarization',
    'get_gpu_utilization',
    'calculate_stt_time_limit',
    # Speaker Mapping (whisperx 대체)
    'assign_speakers_to_segments',
    'process_speaker_labels',
    'get_speaker_timeline',
    'get_speaker_statistics',
]
