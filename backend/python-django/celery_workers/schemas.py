# celery_workers/schemas.py
"""
Celery Task Input Validation Schemas

Pydantic을 사용한 Task 입력 검증
- 타입 안전성 보장
- 명확한 에러 메시지 제공
- 개발자 실수 조기 발견
"""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional


class STTTaskInput(BaseModel):
    """process_stt Task 입력 검증"""

    note_id: int = Field(..., description="처리할 노트의 ID")
    duration_seconds: Optional[int] = Field(None, description="오디오 길이 (초)")

    model_config = ConfigDict(extra='forbid')

    @field_validator('note_id')
    @classmethod
    def validate_note_id(cls, v: int) -> int:
        """note_id는 양수여야 함"""
        if v <= 0:
            raise ValueError(f'note_id must be positive integer, got {v}')
        return v

    @field_validator('duration_seconds')
    @classmethod
    def validate_duration(cls, v: Optional[int]) -> Optional[int]:
        """duration은 양수여야 함 (선택적)"""
        if v is not None and v <= 0:
            raise ValueError(f'duration_seconds must be positive, got {v}')
        return v


class SummaryTaskInput(BaseModel):
    """process_summary Task 입력 검증"""

    note_id: int = Field(..., description="처리할 노트의 ID")

    model_config = ConfigDict(extra='forbid')

    @field_validator('note_id')
    @classmethod
    def validate_note_id(cls, v: int) -> int:
        """note_id는 양수여야 함"""
        if v <= 0:
            raise ValueError(f'note_id must be positive integer, got {v}')
        return v


def validate_task_input(schema_class: type[BaseModel], **kwargs) -> dict:
    """
    Task 입력 검증 헬퍼 함수

    Args:
        schema_class: Pydantic 스키마 클래스
        **kwargs: 검증할 입력 데이터

    Returns:
        검증된 데이터 (dict)

    Raises:
        ValueError: 검증 실패 시

    Example:
        >>> validated = validate_task_input(STTTaskInput, note_id=123)
        >>> validated['note_id']  # 123
    """
    try:
        validated_data = schema_class(**kwargs)
        return validated_data.model_dump()
    except Exception as e:
        raise ValueError(f"Task input validation failed: {str(e)}")
