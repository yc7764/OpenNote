"""
Google Gemini API 프로바이더

Gemini 3 Flash Preview 지원 - 최신 버전, 한국어 성능 우수, 1M 토큰 컨텍스트

google-generativeai(구 SDK, 2026 지원 종료) → google-genai(후속 SDK) 사용.
시스템 프롬프트는 구 SDK의 모델 생성자 인자에서 요청별 config로 이동했다.
"""
import os
from typing import Optional, List

from .base import SummaryProvider, ProviderResult
from .config import LLMConfig


class GeminiProvider(SummaryProvider):
    """Google Gemini API 프로바이더"""

    def __init__(self, model: str = "gemini-3-flash-preview"):
        """
        Args:
            model: 사용할 모델명
                - gemini-3-flash-preview: 최신 버전, 품질 우수 (기본값)
                - gemini-2.5-flash: 안정 버전
                - gemini-2.5-flash-lite: 높은 할당량 (1,000 RPD)
        """
        self.model = model
        self._client = None

    @property
    def name(self) -> str:
        return f"Gemini ({self.model})"

    @property
    def is_available(self) -> bool:
        return bool(os.environ.get('GOOGLE_API_KEY'))

    def call(
        self,
        content: dict,
        user_description: Optional[str] = None,
        user_keywords: Optional[List[str]] = None
    ) -> ProviderResult:
        from celery_workers.common.prompts import SummaryPrompts

        api_key = os.environ.get('GOOGLE_API_KEY')
        if not api_key:
            return ProviderResult(
                success=False,
                error_code=0,
                error_message="GOOGLE_API_KEY not set",
                provider_name=self.name
            )

        try:
            # 지연 임포트 (의존성 없을 때 에러 방지)
            from google import genai
            from google.genai import types as genai_types
            from google.genai import errors as genai_errors

            if self._client is None:
                self._client = genai.Client(api_key=api_key)

            user_prompt = SummaryPrompts.get_user_prompt(
                content, user_description, user_keywords
            )

            response = self._client.models.generate_content(
                model=self.model,
                contents=user_prompt,
                config=genai_types.GenerateContentConfig(
                    system_instruction=SummaryPrompts.get_system_prompt(),
                    max_output_tokens=LLMConfig.MAX_OUTPUT_TOKENS,
                    temperature=LLMConfig.TEMPERATURE,
                    # HttpOptions.timeout은 밀리초 단위
                    http_options=genai_types.HttpOptions(
                        timeout=LLMConfig.API_TIMEOUT_SECONDS * 1000
                    ),
                ),
            )

            return ProviderResult(
                success=True,
                content=response.text,
                provider_name=self.name
            )

        except ImportError:
            return ProviderResult(
                success=False,
                error_code=0,
                error_message="google-genai package not installed",
                provider_name=self.name
            )
        except genai_errors.APIError as e:
            error_message = e.message or str(e)

            if e.code == 429:
                # 할당량 초과 - quota 키워드로 RPD(일일 한도) 여부 판단
                is_daily_limit = 'quota' in error_message.lower()

                return ProviderResult(
                    success=False,
                    error_code=429,
                    error_message=error_message,
                    provider_name=self.name,
                    is_rate_limited=True,
                    # quota 에러는 보통 일일 한도이므로 retry_after 설정 안 함
                    retry_after=None if is_daily_limit else float(LLMConfig.API_TIMEOUT_SECONDS)
                )

            return ProviderResult(
                success=False,
                error_code=e.code or 500,
                error_message=error_message,
                provider_name=self.name
            )
        except Exception as e:
            error_str = str(e)
            # 429 또는 rate limit 관련 에러 감지
            is_rate_limited = (
                '429' in error_str or
                'rate' in error_str.lower() or
                'quota' in error_str.lower() or
                'exhausted' in error_str.lower()
            )

            return ProviderResult(
                success=False,
                error_code=429 if is_rate_limited else 500,
                error_message=error_str,
                provider_name=self.name,
                is_rate_limited=is_rate_limited
            )
