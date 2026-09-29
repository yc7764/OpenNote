"""
Summary API 프로바이더 모듈

폴백 체인을 통한 다중 LLM API 지원
- Groq (Llama 3.3 70B, Llama 3.1 8B)
- Gemini (2.0 Flash)
- Mistral (Large Latest)

Rate limit 인식 및 지능적 폴백:
- Exponential backoff with jitter
- RPM/RPD 구분 처리
- Provider별 cooldown 관리
"""
from .base import SummaryProvider, ProviderResult
from .groq import GroqProvider
from .gemini import GeminiProvider
from .mistral import MistralProvider
from .manager import FallbackManager, get_fallback_manager, reset_fallback_manager
from .rate_limiter import (
    RateLimitManager,
    RateLimitType,
    RateLimitState,
    RetryConfig,
    get_rate_limit_manager,
    reset_rate_limit_manager,
    parse_retry_after,
)

__all__ = [
    # Providers
    'SummaryProvider',
    'ProviderResult',
    'GroqProvider',
    'GeminiProvider',
    'MistralProvider',
    # Manager
    'FallbackManager',
    'get_fallback_manager',
    'reset_fallback_manager',
    # Rate Limiter
    'RateLimitManager',
    'RateLimitType',
    'RateLimitState',
    'RetryConfig',
    'get_rate_limit_manager',
    'reset_rate_limit_manager',
    'parse_retry_after',
]
