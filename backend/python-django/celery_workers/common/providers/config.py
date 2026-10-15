"""
LLM Provider 설정 상수

모든 Provider에서 공통으로 사용하는 설정값을 중앙 관리합니다.
환경변수로 오버라이드 가능합니다.
"""
import os


def _env_str(name: str, default: str) -> str:
    """빈 문자열·공백만 있는 값은 미설정으로 보고 기본값을 쓴다."""
    value = os.getenv(name, '').strip()
    return value or default


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

    # 모델명 — 제공자가 모델을 폐기하면 코드 수정 없이 환경변수로 교체한다.
    # Groq는 llama-3.3-70b-versatile·llama-3.1-8b-instant를 2026-08-16에 종료했고
    # 공식 권장 대체가 openai/gpt-oss-120b(품질)·openai/gpt-oss-20b(안전망)다.
    GROQ_MODEL: str = _env_str('LLM_GROQ_MODEL', 'openai/gpt-oss-120b')
    GROQ_FALLBACK_MODEL: str = _env_str('LLM_GROQ_FALLBACK_MODEL', 'openai/gpt-oss-20b')
    GEMINI_MODEL: str = _env_str('LLM_GEMINI_MODEL', 'gemini-3-flash-preview')
    MISTRAL_MODEL: str = _env_str('LLM_MISTRAL_MODEL', 'mistral-large-latest')
