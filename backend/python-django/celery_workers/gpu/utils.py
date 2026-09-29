# celery_workers/gpu/utils.py
"""
GPU 전용 유틸리티 함수

- 모델 관리 (Whisper, Diarization)
- STT 결과 포맷팅
- GPU 모니터링
- 화자 분리 (pyannote.audio 4.x)

Note: torch, faster_whisper, pyannote.audio 필수 - STT Worker 전용
"""
import os
from typing import Union
import numpy as np
import torch
from celery.utils.log import get_task_logger
from faster_whisper import WhisperModel, decode_audio
from pyannote.audio import Pipeline as DiarizationPipeline

# 화자 매핑 로직은 별도 모듈로 분리 (whisperx 의존성 제거)

logger = get_task_logger(__name__)


def _get_required_env(var_name: str) -> str:
    """환경 변수 필수 검증 (내부용)"""
    value = os.environ.get(var_name)
    if not value:
        raise ValueError(
            f"Required environment variable '{var_name}' is not set. "
            f"Please configure it in your environment or .env file."
        )
    return value


class ModelManager:
    """싱글톤 모델 관리자"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._whisper_model = None
            cls._instance._diarization_model = None
        return cls._instance

    def get_whisper_model(self):
        """Whisper 모델 싱글톤"""
        if self._whisper_model is None:
            device = os.environ.get('WHISPER_DEVICE', 'cuda')
            compute_type = os.environ.get('WHISPER_COMPUTE_TYPE', 'float16')
            model_size = os.environ.get('WHISPER_MODEL_SIZE', 'large-v3-turbo')

            self._whisper_model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type
            )

        return self._whisper_model

    def get_diarization_model(self):
        """Diarization 모델 싱글톤 (pyannote.audio 4.x)

        환경변수:
            DIARIZATION_MODEL: 사용할 모델 (기본값: pyannote/speaker-diarization-community-1)
            HUGGINGFACE_TOKEN: HuggingFace 인증 토큰
            WHISPER_DEVICE: cuda 또는 cpu (기본값: cuda)

        지원 모델:
            - pyannote/speaker-diarization-community-1 (최신, 권장)
            - pyannote/speaker-diarization-3.1 (이전 버전)
        """
        if self._diarization_model is None:
            device = os.environ.get('WHISPER_DEVICE', 'cuda')
            hf_token = _get_required_env('HUGGINGFACE_TOKEN')
            model_name = os.environ.get(
                'DIARIZATION_MODEL',
                'pyannote/speaker-diarization-community-1'
            )

            logger.info(f"Loading diarization model: {model_name}")

            # pyannote.audio 4.x Pipeline 직접 사용
            self._diarization_model = DiarizationPipeline.from_pretrained(
                model_name,
                token=hf_token
            )

            # GPU로 이동
            if device == 'cuda' and torch.cuda.is_available():
                self._diarization_model.to(torch.device('cuda'))
                logger.info("Diarization model moved to CUDA")
            else:
                logger.info("Diarization model running on CPU")

        return self._diarization_model

    def clear_models(self):
        """모델 메모리 해제 (Worker 재시작 시 호출)"""
        if self._whisper_model:
            del self._whisper_model
            self._whisper_model = None

        if self._diarization_model:
            del self._diarization_model
            self._diarization_model = None

        if torch.cuda.is_available():
            torch.cuda.empty_cache()


# 모듈 레벨 인스턴스 (하위 호환성 유지)
model_manager = ModelManager()
get_whisper_model = model_manager.get_whisper_model
get_diarization_model = model_manager.get_diarization_model


def format_transcription(segments, info):
    """Whisper 결과를 표준 포맷으로 변환"""
    formatted_segments = []
    word_segments = []

    for idx, segment in enumerate(segments, start=1):
        segment_dict = {
            "idx": idx,  # 명시적인 순서 보장
            "start": segment.start,
            "end": segment.end,
            "text": segment.text,
            "words": []
        }

        for word in segment.words:
            word_info = {
                "word": word.word,
                "start": word.start,
                "end": word.end,
                "score": word.probability
            }
            segment_dict["words"].append(word_info)
            word_segments.append(word_info)

        formatted_segments.append(segment_dict)

    return {
        "segments": formatted_segments,
        "word_segments": word_segments
    }


def load_audio(audio_path: str, sampling_rate: int = 16000) -> np.ndarray:
    """오디오 파일을 numpy array로 디코딩 (1회 디코딩 후 재사용)

    faster-whisper의 decode_audio를 사용하여 오디오 파일을 로드합니다.
    Whisper와 pyannote에서 공유하여 중복 디코딩을 방지합니다.

    Args:
        audio_path: 오디오 파일 경로 (MP3, WAV, M4A, FLAC 등 지원)
        sampling_rate: 샘플링 레이트 (기본값: 16000Hz)

    Returns:
        np.ndarray: float32 오디오 데이터 (samples,)
    """
    logger.info(f"Decoding audio: {audio_path}")
    audio_np = decode_audio(audio_path, sampling_rate=sampling_rate)
    logger.info(f"Audio decoded: shape={audio_np.shape}, dtype={audio_np.dtype}")
    return audio_np


def audio_to_pyannote_input(audio_np: np.ndarray, sample_rate: int = 16000) -> dict:
    """numpy array를 pyannote.audio Pipeline 입력 형식으로 변환

    Args:
        audio_np: float32 numpy array (samples,)
        sample_rate: 샘플링 레이트 (기본값: 16000Hz)

    Returns:
        dict: {"waveform": torch.Tensor, "sample_rate": int}
    """
    # pyannote는 (channels, samples) 형태의 2D tensor 필요
    audio_tensor = torch.from_numpy(audio_np).unsqueeze(0)  # (samples,) → (1, samples)
    return {"waveform": audio_tensor, "sample_rate": sample_rate}


def run_diarization(
    audio_input: Union[str, np.ndarray],
    pipeline,
    min_speakers=None,
    max_speakers=None,
    hook=None
):
    """화자 분리 실행

    pyannote.audio Pipeline을 사용하여 화자 분리를 수행합니다.

    Args:
        audio_input: 오디오 파일 경로(str) 또는 numpy array
        pipeline: pyannote.audio Pipeline 인스턴스
        min_speakers: 최소 화자 수 (선택)
        max_speakers: 최대 화자 수 (선택)
        hook: ProgressHook 인스턴스 (진행 상황 모니터링용)

    Returns:
        Annotation: pyannote diarization 결과

    환경변수:
        MIN_SPEAKERS: 기본 최소 화자 수 (선택)
        MAX_SPEAKERS: 기본 최대 화자 수 (선택)
    """
    # 환경변수에서 기본값 로드
    if min_speakers is None:
        env_min = os.environ.get('MIN_SPEAKERS')
        min_speakers = int(env_min) if env_min else None

    if max_speakers is None:
        env_max = os.environ.get('MAX_SPEAKERS')
        max_speakers = int(env_max) if env_max else None

    # 파라미터 구성
    kwargs = {}
    if min_speakers is not None:
        kwargs['min_speakers'] = min_speakers
    if max_speakers is not None:
        kwargs['max_speakers'] = max_speakers
    if hook is not None:
        kwargs['hook'] = hook

    logger.info(f"Running diarization with params: {kwargs}")

    # numpy array인 경우 pyannote 입력 형식으로 변환
    if isinstance(audio_input, np.ndarray):
        audio_input = audio_to_pyannote_input(audio_input)
        logger.info("Using in-memory audio for diarization")

    return pipeline(audio_input, **kwargs)


def get_gpu_utilization():
    """현재 GPU 사용률 반환"""
    if not torch.cuda.is_available():
        return None

    try:
        import subprocess
        result = subprocess.check_output(
            ['nvidia-smi', '--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'],
            encoding='utf-8'
        )
        return float(result.strip())
    except:
        return None


def calculate_stt_time_limit(duration_seconds: int) -> int:
    """
    STT Task 시간 제한 계산 (오디오 길이 기반)

    Args:
        duration_seconds: 오디오 길이 (초)

    Returns:
        time_limit: Task 시간 제한 (초)

    공식: (duration * 2) + 300 (5분 여유)
    """
    base_limit = (duration_seconds * 2) + 300
    min_limit = 600     # 10분
    max_limit = 50400   # 14시간 (6시간 오디오 처리 가능)
    return max(min_limit, min(base_limit, max_limit))
