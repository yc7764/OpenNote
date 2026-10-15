"""
Groq API 프로바이더

기본 모델은 LLMConfig.GROQ_MODEL(품질 우선)·GROQ_FALLBACK_MODEL(안전망).
Groq는 모델을 주기적으로 폐기하므로(llama-3.3-70b-versatile·llama-3.1-8b-instant는
2026-08-16 종료) 모델명은 환경변수 LLM_GROQ_MODEL / LLM_GROQ_FALLBACK_MODEL로 바꾼다.
"""
import os
from typing import Optional, List

from .base import SummaryProvider, ProviderResult
from .config import LLMConfig
from .rate_limiter import parse_retry_after


class GroqProvider(SummaryProvider):
    """Groq API 프로바이더 (OpenAI 호환 chat.completions)"""

    def __init__(self, model: str = LLMConfig.GROQ_MODEL):
        """
        Args:
            model: 사용할 모델명 (Groq 모델 ID)
                - openai/gpt-oss-120b: 품질 우선 (기본값, Developer 플랜 30 RPM / 1K RPD)
                - openai/gpt-oss-20b: 안전망 (기본 폴백)
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
            error_message = str(e)

            if is_rate_limited and hasattr(e, 'response') and e.response is not None:
                retry_after = parse_retry_after(
                    e.response.headers.get('Retry-After')
                )

            if e.status_code == 404:
                # 모델 폐기(deprecation) 또는 모델명 오타. 설정 변경 없이는 반복되므로 힌트를 남긴다.
                error_message = (
                    f"{error_message} | 모델 '{self.model}'을(를) Groq에서 찾을 수 없음 — "
                    f"폐기됐을 수 있음. LLM_GROQ_MODEL / LLM_GROQ_FALLBACK_MODEL 환경변수로 교체"
                )

            return ProviderResult(
                success=False,
                error_code=e.status_code,
                error_message=error_message,
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
