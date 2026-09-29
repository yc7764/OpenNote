"""
사용자 조회 유틸리티 함수들
"""
from typing import Optional, Tuple
from django.contrib.auth import get_user_model

User = get_user_model()


def get_user_by_email(email: str) -> Optional['User']:
    """
    이메일로 사용자 조회

    Args:
        email: 조회할 이메일 주소

    Returns:
        User 객체 또는 None
    """
    try:
        return User.objects.get(email=email)
    except User.DoesNotExist:
        return None


def get_user_by_username(username: str) -> Optional['User']:
    """
    사용자명으로 사용자 조회

    Args:
        username: 조회할 사용자명

    Returns:
        User 객체 또는 None
    """
    try:
        return User.objects.get(username=username)
    except User.DoesNotExist:
        return None


def get_user_by_email_or_username(identifier: str) -> Tuple[Optional['User'], str]:
    """
    이메일 또는 사용자명으로 사용자 조회

    Args:
        identifier: 이메일 또는 사용자명

    Returns:
        (User 객체 또는 None, 조회 유형 'email' 또는 'username')
    """
    # 이메일 형식인지 확인
    if '@' in identifier:
        user = get_user_by_email(identifier)
        return user, 'email'
    else:
        user = get_user_by_username(identifier)
        return user, 'username'


def user_exists_by_email(email: str) -> bool:
    """
    이메일로 사용자 존재 여부 확인

    Args:
        email: 확인할 이메일 주소

    Returns:
        사용자 존재 여부
    """
    return User.objects.filter(email=email).exists()


def is_email_available(email: str, exclude_user_id: Optional[int] = None) -> bool:
    """
    이메일 사용 가능 여부 확인 (중복 체크)

    다른 사용자가 이미 사용 중인 이메일인지 확인합니다.
    자기 자신의 이메일은 중복으로 간주하지 않습니다.

    Args:
        email: 확인할 이메일 주소
        exclude_user_id: 제외할 사용자 ID (자기 자신)

    Returns:
        사용 가능 여부 (True: 사용 가능, False: 중복)
    """
    if not email:
        return True

    queryset = User.objects.filter(email=email)
    if exclude_user_id:
        queryset = queryset.exclude(id=exclude_user_id)

    return not queryset.exists()


def user_exists_by_username(username: str) -> bool:
    """
    사용자명으로 사용자 존재 여부 확인

    Args:
        username: 확인할 사용자명

    Returns:
        사용자 존재 여부
    """
    return User.objects.filter(username=username).exists()


def get_user_by_id(user_id: int) -> Optional['User']:
    """
    ID로 사용자 조회

    Args:
        user_id: 사용자 ID

    Returns:
        User 객체 또는 None
    """
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None
