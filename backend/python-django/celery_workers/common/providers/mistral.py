"""
Mistral API 프로바이더

Mistral Large Latest 지원 - 무료 티어 최대 성능 모델
"""
import os
from typing import Optional, List

import requests

from .base import SummaryProvider, ProviderResult
from .config import LLMConfig
from .rate_limiter import parse_retry_after


class MistralProvider(SummaryProvider):
    """Mistral API 프로바이더 (HTTP 직접 호출)"""

    API_URL = "https://api.mistral.ai/v1/chat/completions"

    def __init__(self, model: str = "mistral-large-latest"):
        """
        Args:
            model: 사용할 모델명
                - mistral-large-latest: 무료 티어 최고 품질 (기본값)
                - mistral-medium-latest: 중간 성능
                - mistral-small-latest: 가성비 우수
        """
        self.model = model

    @property
    def name(self) -> str:
        return f"Mistral ({self.model})"

    @property
    def is_available(self) -> bool:
        return bool(os.environ.get('MISTRAL_API_KEY'))

    def call(
        self,
        content: dict,
        user_description: Optional[str] = None,
        user_keywords: Optional[List[str]] = None
    ) -> ProviderResult:
        from celery_workers.common.prompts import SummaryPrompts

        api_key = os.environ.get('MISTRAL_API_KEY')
        if not api_key:
            return ProviderResult(
                success=False,
                error_code=0,
                error_message="MISTRAL_API_KEY not set",
                provider_name=self.name
            )

        try:
            data = {
                "model": self.model,
                "messages": SummaryPrompts.get_messages(
                    content, user_description, user_keywords
                ),
                "max_tokens": LLMConfig.MAX_OUTPUT_TOKENS,
                "temperature": LLMConfig.TEMPERATURE
            }

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }

            response = requests.post(
                self.API_URL,
                headers=headers,
                json=data,
                timeout=LLMConfig.API_TIMEOUT_SECONDS
            )

            if response.status_code == 200:
                return ProviderResult(
                    success=True,
                    content=response.json()["choices"][0]["message"]["content"],
                    provider_name=self.name
                )
            elif response.status_code == 429:
                # Rate limit 에러 - Retry-After 헤더 확인
                retry_after = parse_retry_after(
                    response.headers.get('Retry-After')
                )
                error_message = response.text[:200]

                return ProviderResult(
                    success=False,
                    error_code=429,
                    error_message=error_message,
                    provider_name=self.name,
                    is_rate_limited=True,
                    retry_after=retry_after
                )
            else:
                return ProviderResult(
                    success=False,
                    error_code=response.status_code,
                    error_message=response.text[:200],  # 에러 메시지 길이 제한
                    provider_name=self.name
                )

        except requests.exceptions.Timeout:
            return ProviderResult(
                success=False,
                error_code=408,
                error_message="Request timeout",
                provider_name=self.name
            )
        except requests.exceptions.ConnectionError:
            return ProviderResult(
                success=False,
                error_code=503,
                error_message="Connection error",
                provider_name=self.name
            )
        except Exception as e:
            error_str = str(e)
            is_rate_limited = '429' in error_str or 'rate' in error_str.lower()

            return ProviderResult(
                success=False,
                error_code=429 if is_rate_limited else 500,
                error_message=error_str,
                provider_name=self.name,
                is_rate_limited=is_rate_limited
            )
