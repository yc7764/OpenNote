"""
API 폴백 매니저

품질 우선 순서로 여러 LLM API를 순차적으로 시도
Rate limit 인식 및 지능적 폴백 지원
"""
import time
import logging
from typing import List, Optional

from .base import SummaryProvider, ProviderResult
from .config import LLMConfig
from .groq import GroqProvider
from .gemini import GeminiProvider
from .mistral import MistralProvider
from .rate_limiter import (
    get_rate_limit_manager,
    RateLimitType,
)

logger = logging.getLogger(__name__)


class FallbackManager:
    """
    API 폴백 체인 관리자

    Features:
    - 품질 우선 순서로 프로바이더 시도
    - Rate limit 인식 및 자동 건너뛰기
    - RPM/RPD 구분 처리
    - Exponential backoff 재시도
    """

    def __init__(
        self,
        providers: Optional[List[SummaryProvider]] = None,
        max_retries_per_provider: int = LLMConfig.MAX_RETRIES_PER_PROVIDER,
        retry_on_rate_limit: bool = True
    ):
        """
        Args:
            providers: 사용할 프로바이더 목록 (순서대로 시도)
                       None이면 기본 폴백 순서 사용
            max_retries_per_provider: 프로바이더당 최대 재시도 횟수 (rate limit 시)
            retry_on_rate_limit: RPM 제한 시 재시도 여부
        """
        if providers is None:
            # 기본 폴백 순서: 품질 우선
            providers = [
                GroqProvider(model="llama-3.3-70b-versatile"),
                GeminiProvider(model="gemini-3-flash-preview"),
                MistralProvider(model="mistral-large-latest"),
                GroqProvider(model="llama-3.1-8b-instant"),
            ]
        self.providers = providers
        self.max_retries_per_provider = max_retries_per_provider
        self.retry_on_rate_limit = retry_on_rate_limit
        self._rate_limiter = get_rate_limit_manager()

    def call_with_fallback(
        self,
        content: dict,
        user_description: Optional[str] = None,
        user_keywords: Optional[List[str]] = None
    ) -> ProviderResult:
        """
        폴백 체인을 통해 API 호출

        Rate limit 발생 시:
        - RPM 제한: 대기 후 재시도 (max_retries_per_provider까지)
        - RPD 제한: 즉시 다음 프로바이더로 폴백

        Args:
            content: STT 결과 데이터
            user_description: 사용자가 입력한 노트 설명
            user_keywords: 사용자가 입력한 키워드 목록

        Returns:
            ProviderResult: 첫 번째 성공한 프로바이더의 결과 또는 전체 실패
        """
        errors = []

        for provider in self.providers:
            if not provider.is_available:
                logger.debug(f"[Fallback] {provider.name}: API key not configured, skipping")
                continue

            # Rate limit 상태 확인
            if self._rate_limiter.should_skip_provider(provider.name):
                state = self._rate_limiter.get_state(provider.name)
                logger.info(
                    f"[Fallback] {provider.name}: Skipping due to rate limit "
                    f"(type={state.limit_type.value})"
                )
                errors.append((provider.name, 429, f"Rate limited ({state.limit_type.value})"))
                continue

            # 프로바이더 시도 (재시도 포함)
            result = self._try_provider_with_retry(
                provider, content, user_description, user_keywords
            )

            if result.success:
                self._rate_limiter.record_success(provider.name)
                logger.info(f"[Fallback] Success with {provider.name}")
                return result

            # 실패 기록
            errors.append((provider.name, result.error_code, result.error_message))

            # Rate limit 발생 시 기록
            if result.is_rate_limited:
                self._rate_limiter.record_rate_limit(
                    provider_name=provider.name,
                    retry_after_seconds=result.retry_after,
                    error_message=result.error_message or ""
                )

        # 모든 프로바이더 실패
        error_summary = "; ".join([f"{name}: {code}" for name, code, _ in errors])
        logger.error(f"[Fallback] All providers failed: {error_summary}")

        return ProviderResult(
            success=False,
            error_code=503,
            error_message=f"All providers failed: {error_summary}",
            provider_name="FallbackManager"
        )

    def _try_provider_with_retry(
        self,
        provider: SummaryProvider,
        content: dict,
        user_description: Optional[str],
        user_keywords: Optional[List[str]]
    ) -> ProviderResult:
        """
        단일 프로바이더 호출 (재시도 로직 포함)

        Args:
            provider: 시도할 프로바이더
            content: STT 결과 데이터
            user_description: 노트 설명
            user_keywords: 키워드 목록

        Returns:
            ProviderResult: 최종 결과
        """
        last_result = None
        retries = 0

        while retries <= self.max_retries_per_provider:
            if retries > 0:
                logger.info(f"[Fallback] {provider.name}: Retry attempt {retries}/{self.max_retries_per_provider}")

            try:
                result = provider.call(content, user_description, user_keywords)

                if result.success:
                    return result

                last_result = result

                # Rate limit이 아니면 재시도 없이 실패 반환
                if not result.is_rate_limited:
                    logger.warning(
                        f"[Fallback] {provider.name} failed: "
                        f"{result.error_code} - {result.error_message}"
                    )
                    return result

                # Rate limit 발생
                logger.warning(
                    f"[Fallback] {provider.name} rate limited: "
                    f"{result.error_code} - {result.error_message}"
                )

                # 재시도 비활성화 또는 최대 재시도 도달
                if not self.retry_on_rate_limit or retries >= self.max_retries_per_provider:
                    return result

                # RPD 제한은 재시도하지 않음
                limit_type = self._infer_limit_type(result.error_message or "")
                if limit_type == RateLimitType.RPD:
                    logger.info(f"[Fallback] {provider.name}: Daily limit reached, skipping retries")
                    return result

                # 대기 후 재시도
                wait_time = result.retry_after or self._calculate_wait_time(retries)
                # 최대 대기 시간 초과 시 다음 프로바이더로
                if wait_time > LLMConfig.MAX_WAIT_TIME_SECONDS:
                    logger.info(
                        f"[Fallback] {provider.name}: Wait time too long ({wait_time:.1f}s), "
                        f"moving to next provider"
                    )
                    return result

                logger.info(f"[Fallback] {provider.name}: Waiting {wait_time:.1f}s before retry")
                time.sleep(wait_time)
                retries += 1

            except Exception as e:
                logger.error(f"[Fallback] {provider.name} exception: {e}")
                return ProviderResult(
                    success=False,
                    error_code=500,
                    error_message=str(e),
                    provider_name=provider.name
                )

        return last_result or ProviderResult(
            success=False,
            error_code=500,
            error_message="Max retries exceeded",
            provider_name=provider.name
        )

    def _infer_limit_type(self, error_message: str) -> RateLimitType:
        """에러 메시지에서 limit type 추론"""
        error_lower = error_message.lower()

        if any(kw in error_lower for kw in ["daily", "day", "rpd", "quota"]):
            return RateLimitType.RPD

        if any(kw in error_lower for kw in ["minute", "rpm", "rate"]):
            return RateLimitType.RPM

        return RateLimitType.UNKNOWN

    def _calculate_wait_time(self, attempt: int) -> float:
        """Exponential backoff 대기 시간 계산"""
        return min(
            LLMConfig.BASE_DELAY_SECONDS * (2 ** attempt),
            LLMConfig.MAX_BACKOFF_SECONDS
        )


# 싱글톤 인스턴스
_manager: Optional[FallbackManager] = None


def get_fallback_manager() -> FallbackManager:
    """싱글톤 FallbackManager 인스턴스 반환"""
    global _manager
    if _manager is None:
        _manager = FallbackManager()
    return _manager


def reset_fallback_manager():
    """테스트용: 싱글톤 인스턴스 초기화"""
    global _manager
    _manager = None
