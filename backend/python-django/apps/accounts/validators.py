"""
공통 유효성 검사 함수들
"""
import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _


# 비밀번호 설정
MIN_PASSWORD_LENGTH = 8
PASSWORD_LENGTH_ERROR_MESSAGE = _('비밀번호는 최소 {}자 이상이어야 합니다.').format(MIN_PASSWORD_LENGTH)
PASSWORD_COMPLEXITY_ERROR_MESSAGE = _('비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.')


def validate_password_length(password: str) -> None:
    """
    비밀번호 최소 길이 검증

    Args:
        password: 검증할 비밀번호

    Raises:
        ValidationError: 비밀번호가 최소 길이보다 짧은 경우
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationError(PASSWORD_LENGTH_ERROR_MESSAGE)


def validate_password_complexity(password: str) -> None:
    """
    비밀번호 복잡성 검증 (영문 + 숫자 + 특수문자 조합)

    Args:
        password: 검증할 비밀번호

    Raises:
        ValidationError: 비밀번호가 복잡성 요구사항을 충족하지 않는 경우
    """
    has_letter = bool(re.search(r'[a-zA-Z]', password))
    has_digit = bool(re.search(r'[0-9]', password))
    has_special = bool(re.search(r'[^a-zA-Z0-9]', password))

    if not (has_letter and has_digit and has_special):
        raise ValidationError(PASSWORD_COMPLEXITY_ERROR_MESSAGE)


def validate_passwords_match(password1: str, password2: str) -> None:
    """
    비밀번호 일치 여부 검증

    Args:
        password1: 첫 번째 비밀번호
        password2: 확인용 비밀번호

    Raises:
        ValidationError: 비밀번호가 일치하지 않는 경우
    """
    if password1 != password2:
        raise ValidationError(_('비밀번호가 일치하지 않습니다.'))
