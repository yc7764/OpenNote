"""
검증 유틸리티 함수들
"""
import uuid
from typing import Optional, Tuple
from rest_framework.response import Response
from rest_framework import status


def validate_uuid(value: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    UUID 형식 검증

    Args:
        value: 검증할 UUID 문자열

    Returns:
        (유효 여부, 에러 메시지 또는 None)
    """
    if not value:
        return False, '토큰이 필요합니다.'

    try:
        uuid.UUID(str(value))
        return True, None
    except ValueError:
        return False, '유효하지 않은 토큰 형식입니다.'


def validate_uuid_or_error(value: Optional[str], field_name: str = '토큰') -> Optional[Response]:
    """
    UUID 검증 후 에러 응답 반환

    Args:
        value: 검증할 UUID 문자열
        field_name: 에러 메시지에 표시할 필드명

    Returns:
        에러 시 Response 객체, 성공 시 None
    """
    if not value:
        return Response({
            'detail': f'{field_name}이(가) 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        uuid.UUID(str(value))
        return None
    except ValueError:
        return Response({
            'detail': '유효하지 않은 토큰 형식입니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
