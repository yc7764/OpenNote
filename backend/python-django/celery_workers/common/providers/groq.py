"""
Groq API 프로바이더

Llama 3.3 70B (품질 우선) 및 Llama 3.1 8B (안전망) 지원
"""
import os
from typing import Optional, List

from .base import SummaryProvider, ProviderResult
from .config import LLMConfig
from .rate_limiter import parse_retry_after


class GroqProvider(SummaryProvider):
    """Groq API를 통한 Llama 모델 프로바이더"""

    def __init__(self, model: str = "llama-3.3-70b-versatile"):
        """
        Args:
            model: 사용할 모델명
                - llama-3.3-70b-versatile: 품질 우선 (RPD 1,000)
                - llama-3.1-8b-instant: 안전망 (RPD 14,400)
        """
        self.model = model
        self._client = None

    @property
    def name(self) -> str:
        return f"Groq ({self.model})"

    @property
    def is_available(self) -> bool:
        return bool(os.environ.get('GROQ_API_KEY'))

    def call(
        self,
        content: dict,
        user_description: Optional[str] = None,
        user_keywords: Optional[List[str]] = None
    ) -> ProviderResult:
        from celery_workers.common.prompts import SummaryPrompts

        if not self.is_available:
            return ProviderResult(
                success=False,
                error_code=0,
                error_message="GROQ_API_KEY not set",
                provider_name=self.name
            )

        try:
            # 지연 임포트 (의존성 없을 때 에러 방지)
            from groq import Groq, RateLimitError, APIStatusError

            if self._client is None:
                self._client = Groq()

            messages = SummaryPrompts.get_messages(
                content, user_description, user_keywords
            )

            response = self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=LLMConfig.MAX_OUTPUT_TOKENS,
                temperature=LLMConfig.TEMPERATURE,
                timeout=LLMConfig.API_TIMEOUT_SECONDS
            )

            return ProviderResult(
                success=True,
                content=response.choices[0].message.content,
                provider_name=self.name
            )

        except ImportError:
            return ProviderResult(
                success=False,
                error_code=0,
                error_message="groq package not installed",
                provider_name=self.name
            )
        except RateLimitError as e:
            # Groq SDK의 RateLimitError 처리
            retry_after = None
            error_message = str(e)

            # 응답 헤더에서 Retry-After 추출 시도
            if hasattr(e, 'response') and e.response is not None:
                retry_after = parse_retry_after(
                    e.response.headers.get('Retry-After')
                )

            return ProviderResult(
                success=False,
                error_code=429,
                error_message=error_message,
                provider_name=self.name,
                is_rate_limited=True,
                retry_after=retry_after
            )
        except APIStatusError as e:
            # 기타 API 에러 (429 포함)
            is_rate_limited = e.status_code == 429
            retry_after = None

            if is_rate_limited and hasattr(e, 'response') and e.response is not None:
                retry_after = parse_retry_after(
                    e.response.headers.get('Retry-After')
                )

            return ProviderResult(
                success=False,
                error_code=e.status_code,
                error_message=str(e),
                provider_name=self.name,
                is_rate_limited=is_rate_limited,
                retry_after=retry_after
            )
        except Exception as e:
            # 429 에러가 문자열에 포함된 경우 처리
            error_str = str(e)
            is_rate_limited = '429' in error_str or 'rate' in error_str.lower()

            return ProviderResult(
                success=False,
                error_code=429 if is_rate_limited else 500,
                error_message=error_str,
                provider_name=self.name,
                is_rate_limited=is_rate_limited
            )
