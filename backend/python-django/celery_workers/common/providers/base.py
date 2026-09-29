"""
요약 API 프로바이더 추상 기본 클래스
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List


@dataclass
class ProviderResult:
    """API 호출 결과를 담는 데이터 클래스"""
    success: bool
    content: Optional[str] = None
    error_code: Optional[int] = None
    error_message: Optional[str] = None
    provider_name: Optional[str] = None
    # Rate limit 관련 필드
    retry_after: Optional[float] = None  # Retry-After 헤더 값 (초)
    is_rate_limited: bool = False  # 429 에러 여부

    def to_legacy_tuple(self):
        """기존 (bool, result) 형식으로 변환 (하위 호환성)"""
        if self.success:
            return True, self.content
        return False, (self.error_code, self.error_message)


class SummaryProvider(ABC):
    """요약 API 프로바이더 추상 클래스"""

    @property
    @abstractmethod
    def name(self) -> str:
        """프로바이더 이름"""
        pass

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """API 키 설정 여부 확인"""
        pass

    @abstractmethod
    def call(
        self,
        content: dict,
        user_description: Optional[str] = None,
        user_keywords: Optional[List[str]] = None
    ) -> ProviderResult:
        """
        API 호출

        Args:
            content: STT 결과 데이터
            user_description: 사용자가 입력한 노트 설명
            user_keywords: 사용자가 입력한 키워드 목록

        Returns:
            ProviderResult: 성공 시 content 포함, 실패 시 error_code/message 포함
        """
        pass
