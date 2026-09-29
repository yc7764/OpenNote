"""
LLM Provider 설정 상수

모든 Provider에서 공통으로 사용하는 설정값을 중앙 관리합니다.
환경변수로 오버라이드 가능합니다.
"""
import os


class LLMConfig:
    """LLM API 공통 설정"""

    # API 호출 설정
    API_TIMEOUT_SECONDS: int = int(os.getenv('LLM_API_TIMEOUT', 60))
    MAX_OUTPUT_TOKENS: int = int(os.getenv('LLM_MAX_TOKENS', 3200))
    TEMPERATURE: float = float(os.getenv('LLM_TEMPERATURE', 0.5))

    # Fallback 설정
    MAX_WAIT_TIME_SECONDS: int = int(os.getenv('LLM_MAX_WAIT_TIME', 30))
    MAX_RETRIES_PER_PROVIDER: int = int(os.getenv('LLM_MAX_RETRIES', 2))

    # Exponential backoff
    BASE_DELAY_SECONDS: float = 1.0
    MAX_BACKOFF_SECONDS: float = 30.0
