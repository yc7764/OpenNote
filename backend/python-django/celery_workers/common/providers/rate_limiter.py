"""
Rate Limit 관리 모듈

각 프로바이더별 rate limit 상태를 추적하고 재시도 로직을 제공합니다.
- Exponential backoff with jitter
- Retry-After 헤더 지원
- RPM/RPD 구분 처리
- Provider별 cooldown 관리
"""
import time
import random
import logging
from dataclasses import dataclass
from typing import Optional, Dict
from enum import Enum

logger = logging.getLogger(__name__)


class RateLimitType(Enum):
    """Rate limit 종류"""
    RPM = "rpm"  # Requests Per Minute (일시적, 재시도 가능)
    RPD = "rpd"  # Requests Per Day (장기적, 폴백 권장)
    UNKNOWN = "unknown"


@dataclass
class RateLimitState:
    """프로바이더별 rate limit 상태"""
    provider_name: str
    is_limited: bool = False
    limit_type: RateLimitType = RateLimitType.UNKNOWN
    retry_after: Optional[float] = None  # 재시도 가능 시각 (Unix timestamp)
    consecutive_failures: int = 0
    last_failure_time: Optional[float] = None

    def can_retry(self) -> bool:
        """현재 재시도 가능 여부"""
        if not self.is_limited:
            return True
        if self.retry_after is None:
            return True
        return time.time() >= self.retry_after

    def time_until_retry(self) -> float:
        """재시도까지 남은 시간 (초)"""
        if not self.is_limited or self.retry_after is None:
            return 0
        remaining = self.retry_after - time.time()
        return max(0, remaining)

    def reset(self):
        """성공 시 상태 초기화"""
        self.is_limited = False
        self.limit_type = RateLimitType.UNKNOWN
        self.retry_after = None
        self.consecutive_failures = 0
        self.last_failure_time = None


@dataclass
class RetryConfig:
    """재시도 설정"""
    max_retries: int = 3
    base_delay: float = 1.0  # 초
    max_delay: float = 60.0  # 최대 대기 시간
    exponential_base: float = 2.0
    jitter: float = 0.1  # 10% jitter


class RateLimitManager:
    """
    프로바이더별 rate limit 상태 관리자

    싱글톤으로 운영되며, 모든 프로바이더의 rate limit 상태를 추적합니다.
    """

    def __init__(self):
        self._states: Dict[str, RateLimitState] = {}
        self._config = RetryConfig()

    def get_state(self, provider_name: str) -> RateLimitState:
        """프로바이더의 rate limit 상태 조회"""
        if provider_name not in self._states:
            self._states[provider_name] = RateLimitState(provider_name=provider_name)
        return self._states[provider_name]

    def record_success(self, provider_name: str):
        """성공 시 상태 초기화"""
        state = self.get_state(provider_name)
        state.reset()
        logger.debug(f"[RateLimit] {provider_name}: Success, state reset")

    def record_rate_limit(
        self,
        provider_name: str,
        retry_after_seconds: Optional[float] = None,
        limit_type: RateLimitType = RateLimitType.UNKNOWN,
        error_message: str = ""
    ):
        """
        Rate limit 발생 기록

        Args:
            provider_name: 프로바이더 이름
            retry_after_seconds: Retry-After 헤더 값 (초)
            limit_type: RPM/RPD 구분
            error_message: 에러 메시지 (limit_type 추론용)
        """
        state = self.get_state(provider_name)
        state.is_limited = True
        state.consecutive_failures += 1
        state.last_failure_time = time.time()

        # limit_type 추론
        if limit_type == RateLimitType.UNKNOWN:
            limit_type = self._infer_limit_type(error_message)
        state.limit_type = limit_type

        # retry_after 계산
        if retry_after_seconds is not None:
            state.retry_after = time.time() + retry_after_seconds
        else:
            # Exponential backoff 계산
            delay = self._calculate_backoff(state.consecutive_failures)
            state.retry_after = time.time() + delay

        logger.warning(
            f"[RateLimit] {provider_name}: Rate limited "
            f"(type={limit_type.value}, retry_after={state.time_until_retry():.1f}s, "
            f"consecutive_failures={state.consecutive_failures})"
        )

    def _infer_limit_type(self, error_message: str) -> RateLimitType:
        """에러 메시지에서 limit type 추론"""
        error_lower = error_message.lower()

        # RPD 키워드
        if any(kw in error_lower for kw in ["daily", "day", "rpd", "quota"]):
            return RateLimitType.RPD

        # RPM 키워드
        if any(kw in error_lower for kw in ["minute", "rpm", "rate"]):
            return RateLimitType.RPM

        return RateLimitType.UNKNOWN

    def _calculate_backoff(self, attempt: int) -> float:
        """Exponential backoff with jitter 계산"""
        delay = self._config.base_delay * (self._config.exponential_base ** (attempt - 1))
        delay = min(delay, self._config.max_delay)

        # Jitter 추가 (±10%)
        jitter_range = delay * self._config.jitter
        delay += random.uniform(-jitter_range, jitter_range)

        return max(0, delay)

    def should_skip_provider(self, provider_name: str) -> bool:
        """
        프로바이더를 건너뛰어야 하는지 확인

        RPD 제한이거나 아직 retry_after 시간이 안 된 경우 True
        """
        state = self.get_state(provider_name)

        if not state.is_limited:
            return False

        # RPD 제한은 당일 내내 건너뛰기
        if state.limit_type == RateLimitType.RPD:
            logger.info(f"[RateLimit] {provider_name}: Skipping due to daily limit")
            return True

        # 아직 cooldown 중이면 건너뛰기
        if not state.can_retry():
            remaining = state.time_until_retry()
            logger.debug(f"[RateLimit] {provider_name}: Still in cooldown ({remaining:.1f}s remaining)")
            return True

        return False

    def get_retry_delay(self, provider_name: str) -> float:
        """현재 재시도 대기 시간 조회"""
        state = self.get_state(provider_name)
        return state.time_until_retry()

    def reset_all(self):
        """모든 상태 초기화 (테스트용)"""
        self._states.clear()


# 싱글톤 인스턴스
_rate_limit_manager: Optional[RateLimitManager] = None


def get_rate_limit_manager() -> RateLimitManager:
    """싱글톤 RateLimitManager 인스턴스 반환"""
    global _rate_limit_manager
    if _rate_limit_manager is None:
        _rate_limit_manager = RateLimitManager()
    return _rate_limit_manager


def reset_rate_limit_manager():
    """테스트용: 싱글톤 인스턴스 초기화"""
    global _rate_limit_manager
    _rate_limit_manager = None


def parse_retry_after(value: Optional[str]) -> Optional[float]:
    """
    Retry-After 헤더 파싱

    Args:
        value: Retry-After 헤더 값 (초 단위 숫자 또는 HTTP-date)

    Returns:
        대기해야 할 시간 (초), 파싱 실패 시 None
    """
    if not value:
        return None

    try:
        # 숫자 형식 (예: "60")
        return float(value)
    except ValueError:
        pass

    # HTTP-date 형식은 현재 미지원 (필요시 추가)
    logger.warning(f"[RateLimit] Could not parse Retry-After header: {value}")
    return None
