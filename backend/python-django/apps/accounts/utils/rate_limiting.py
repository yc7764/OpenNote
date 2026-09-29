"""
Rate limiting 관련 유틸리티 함수
"""
from django.core.cache import cache
from django.conf import settings
from typing import Optional, Tuple

# 클라이언트 IP 판별은 apps.common.client_ip가 정본이다.
# `from apps.accounts.utils import get_client_ip` 경로를 쓰는 호출부가 있어 재수출한다.
from apps.common.client_ip import get_client_ip  # noqa: F401


class AttemptLimiter:
    """
    캐시 기반 시도 횟수 제한을 관리하는 클래스
    """

    def __init__(self, prefix: str, max_attempts_setting: str, lockout_duration_setting: str,
                 default_max_attempts: int = 5, default_lockout_duration: int = 300):
        self.prefix = prefix
        self.max_attempts = getattr(settings, max_attempts_setting, default_max_attempts)
        self.lockout_duration = getattr(settings, lockout_duration_setting, default_lockout_duration)

    def _get_cache_key(self, identifier: str, key_type: str) -> str:
        """캐시 키를 생성합니다."""
        return f'{self.prefix}_{key_type}_{identifier}'

    def get_attempts(self, identifier: str, key_type: str) -> int:
        """특정 식별자의 시도 횟수를 가져옵니다."""
        cache_key = self._get_cache_key(identifier, key_type)
        return cache.get(cache_key, 0)

    def increment_attempts(self, identifier: str, key_type: str) -> int:
        """시도 횟수를 원자적으로 증가시키고 새로운 횟수를 반환합니다.

        기존 get()+set()은 동시 실패 요청이 서로 덮어써 언더카운트되어
        락아웃이 약화됐다. cache.add(원자적 최초 설정)+cache.incr(원자적 증가)로
        경쟁을 제거한다. cache.touch로 슬라이딩 윈도우(활동 시 만료 연장)를 보존한다.
        """
        cache_key = self._get_cache_key(identifier, key_type)
        # add는 키가 없을 때만 설정(원자적) → 최초 0 시드
        cache.add(cache_key, 0, self.lockout_duration)
        try:
            attempts = cache.incr(cache_key)
        except ValueError:
            # add와 incr 사이에 만료된 드문 경우 — 1로 재설정
            cache.set(cache_key, 1, self.lockout_duration)
            return 1
        # 슬라이딩 윈도우 유지: 새 실패마다 만료를 연장(카운트와 무관, TTL만 갱신)
        cache.touch(cache_key, self.lockout_duration)
        return attempts

    def clear_attempts(self, identifier: str, key_type: str) -> None:
        """시도 횟수를 초기화합니다."""
        cache_key = self._get_cache_key(identifier, key_type)
        cache.delete(cache_key)

    def is_blocked(self, identifier: str, key_type: str) -> bool:
        """제한에 걸렸는지 확인합니다."""
        return self.get_attempts(identifier, key_type) >= self.max_attempts

    def get_lockout_message(self, identifier_name: str) -> str:
        """제한 메시지를 생성합니다."""
        return (f"{identifier_name} {self.max_attempts}회 시도로 "
                f"{self.lockout_duration//60}분간 제한됩니다.")


# 각 기능별 AttemptLimiter 인스턴스 생성
login_limiter = AttemptLimiter(
    prefix='login_attempts',
    max_attempts_setting='LOGIN_ATTEMPT_LIMIT',
    lockout_duration_setting='LOGIN_LOCKOUT_DURATION',
    default_max_attempts=5,
    default_lockout_duration=5 * 60  # 5분 (5 * 60초)
)

password_reset_limiter = AttemptLimiter(
    prefix='password_reset_attempts',
    max_attempts_setting='PASSWORD_RESET_ATTEMPT_LIMIT',
    lockout_duration_setting='PASSWORD_RESET_LOCKOUT_DURATION',
    default_max_attempts=3,
    default_lockout_duration=10 * 60  # 10분 (10 * 60초)
)

registration_limiter = AttemptLimiter(
    prefix='registration_attempts',
    max_attempts_setting='REGISTRATION_ATTEMPT_LIMIT',
    lockout_duration_setting='REGISTRATION_LOCKOUT_DURATION',
    default_max_attempts=5,
    default_lockout_duration=5 * 60  # 5분 (5 * 60초)
)

email_verification_resend_limiter = AttemptLimiter(
    prefix='email_verification_resend_attempts',
    max_attempts_setting='EMAIL_VERIFICATION_RESEND_LIMIT',
    lockout_duration_setting='EMAIL_VERIFICATION_RESEND_LOCKOUT_DURATION',
    default_max_attempts=3,
    default_lockout_duration=5 * 60  # 5분 (5 * 60초)
)

# 이메일 인증 상태 확인 제한 (계정 열거 완화, IP 기반 분당 20회)
email_verify_status_limiter = AttemptLimiter(
    prefix='email_verify_status_attempts',
    max_attempts_setting='EMAIL_VERIFY_STATUS_LIMIT',
    lockout_duration_setting='EMAIL_VERIFY_STATUS_LOCKOUT_DURATION',
    default_max_attempts=20,
    default_lockout_duration=60  # 1분
)


def check_email_verify_status_attempts(ip_address: str) -> Optional[str]:
    """이메일 인증 상태 확인 시도 횟수(IP 기반) — 계정 열거 대량 조회 완화."""
    if email_verify_status_limiter.is_blocked(ip_address, 'ip'):
        return email_verify_status_limiter.get_lockout_message("현재 IP에서 이메일 인증 상태 확인")
    return None


def record_email_verify_status_attempt(ip_address: str) -> int:
    """이메일 인증 상태 확인 시도를 기록합니다."""
    return email_verify_status_limiter.increment_attempts(ip_address, 'ip')


# 이메일 변경(프로필) 관련 제한자들
email_change_request_limiter = AttemptLimiter(
    prefix='email_change_request_attempts',
    max_attempts_setting='EMAIL_CHANGE_REQUEST_LIMIT',
    lockout_duration_setting='EMAIL_CHANGE_REQUEST_LOCKOUT_DURATION',
    default_max_attempts=5,
    default_lockout_duration=10 * 60  # 10분
)

email_change_resend_limiter = AttemptLimiter(
    prefix='email_change_resend_attempts',
    max_attempts_setting='EMAIL_CHANGE_RESEND_LIMIT',
    lockout_duration_setting='EMAIL_CHANGE_RESEND_LOCKOUT_DURATION',
    default_max_attempts=5,
    default_lockout_duration=10 * 60  # 10분
)

# 즐겨찾기 토글 제한 (분당 30회)
favorite_toggle_limiter = AttemptLimiter(
    prefix='favorite_toggle_attempts',
    max_attempts_setting='FAVORITE_TOGGLE_LIMIT',
    lockout_duration_setting='FAVORITE_TOGGLE_LOCKOUT_DURATION',
    default_max_attempts=30,
    default_lockout_duration=60  # 1분
)

# 휴지통 작업 제한 (분당 20회)
trash_action_limiter = AttemptLimiter(
    prefix='trash_action_attempts',
    max_attempts_setting='TRASH_ACTION_LIMIT',
    lockout_duration_setting='TRASH_ACTION_LOCKOUT_DURATION',
    default_max_attempts=20,
    default_lockout_duration=60  # 1분
)

# 소셜 이메일 인증 관련 제한
social_email_submit_limiter = AttemptLimiter(
    prefix='social_email_submit_attempts',
    max_attempts_setting='SOCIAL_EMAIL_SUBMIT_LIMIT',
    lockout_duration_setting='SOCIAL_EMAIL_SUBMIT_LOCKOUT_DURATION',
    default_max_attempts=5,
    default_lockout_duration=60  # 1분
)

social_email_verify_limiter = AttemptLimiter(
    prefix='social_email_verify_attempts',
    max_attempts_setting='SOCIAL_EMAIL_VERIFY_LIMIT',
    lockout_duration_setting='SOCIAL_EMAIL_VERIFY_LOCKOUT_DURATION',
    default_max_attempts=10,
    default_lockout_duration=60  # 1분
)

social_email_resend_limiter = AttemptLimiter(
    prefix='social_email_resend_attempts',
    max_attempts_setting='SOCIAL_EMAIL_RESEND_LIMIT',
    lockout_duration_setting='SOCIAL_EMAIL_RESEND_LOCKOUT_DURATION',
    default_max_attempts=3,
    default_lockout_duration=60  # 1분
)

social_email_status_limiter = AttemptLimiter(
    prefix='social_email_status_attempts',
    max_attempts_setting='SOCIAL_EMAIL_STATUS_LIMIT',
    lockout_duration_setting='SOCIAL_EMAIL_STATUS_LOCKOUT_DURATION',
    default_max_attempts=20,
    default_lockout_duration=60  # 1분
)


def _login_user_identifier(username: str, ip_address: str) -> str:
    """계정 락아웃 키를 (IP, username) 복합으로 만든다.

    기존엔 username 단독 키라, 공격자가 피해자 아이디로 5회 실패시키면
    피해자가 IP와 무관하게 전역 잠기는 표적 DoS가 됐다. 복합 키로 바꾸면
    '공격자 IP + 피해자 계정' 조합만 잠기고, 피해자 본인(다른 IP)은 영향이 없다.
    브루트포스 방어는 IP 단독 카운터가 계속 담당한다.
    """
    return f'{ip_address}|{username}'


def check_login_attempts(username: str, ip_address: str) -> Optional[str]:
    """
    로그인 시도 횟수를 확인합니다.
    (IP, 사용자명) 복합 키와 IP 단독 기준으로 제한합니다.
    """
    # (IP, 사용자명) 복합 기반 확인 — 표적 DoS 방지
    if login_limiter.is_blocked(_login_user_identifier(username, ip_address), 'user'):
        return login_limiter.get_lockout_message(f"사용자 '{username}'")

    # IP 기반 확인
    if login_limiter.is_blocked(ip_address, 'ip'):
        return login_limiter.get_lockout_message("현재 IP")

    return None  # 제한 없음


def record_failed_login(username: str, ip_address: str) -> Tuple[int, int]:
    """
    실패한 로그인 시도를 기록합니다.
    """
    user_attempts = login_limiter.increment_attempts(_login_user_identifier(username, ip_address), 'user')
    ip_attempts = login_limiter.increment_attempts(ip_address, 'ip')

    return user_attempts, ip_attempts


def clear_login_attempts(username: str, ip_address: str) -> None:
    """
    성공한 로그인 후 시도 횟수를 초기화합니다.
    """
    login_limiter.clear_attempts(_login_user_identifier(username, ip_address), 'user')
    login_limiter.clear_attempts(ip_address, 'ip')


def get_remaining_login_attempts(username: str, ip_address: str) -> int:
    """복합 키 기준 남은 로그인 시도 횟수(표시용)."""
    current = login_limiter.get_attempts(_login_user_identifier(username, ip_address), 'user')
    return max(0, login_limiter.max_attempts - current)


def check_password_reset_attempts(email: str, ip_address: str) -> Optional[str]:
    """
    비밀번호 재설정 시도 횟수를 확인합니다.
    """
    # 이메일 기반 확인
    if password_reset_limiter.is_blocked(email, 'email'):
        return password_reset_limiter.get_lockout_message("해당 이메일의 비밀번호 재설정 시도 횟수를 초과했습니다")

    # IP 기반 확인
    if password_reset_limiter.is_blocked(ip_address, 'ip'):
        return password_reset_limiter.get_lockout_message("현재 IP에서 비밀번호 재설정 시도 횟수를 초과했습니다")

    return None  # 제한 없음


def record_failed_password_reset(email: str, ip_address: str) -> Tuple[int, int]:
    """
    실패한 비밀번호 재설정 시도를 기록합니다.
    """
    email_attempts = password_reset_limiter.increment_attempts(email, 'email')
    ip_attempts = password_reset_limiter.increment_attempts(ip_address, 'ip')

    return email_attempts, ip_attempts


def clear_password_reset_attempts(email: str, ip_address: str) -> None:
    """
    성공한 비밀번호 재설정 후 시도 횟수를 초기화합니다.
    """
    password_reset_limiter.clear_attempts(email, 'email')
    password_reset_limiter.clear_attempts(ip_address, 'ip')


def check_registration_attempts(ip_address: str) -> Optional[str]:
    """
    회원가입 시도 횟수를 확인합니다. (IP 기반으로만 제한)
    """
    if registration_limiter.is_blocked(ip_address, 'ip'):
        return registration_limiter.get_lockout_message("현재 IP에서 회원가입")

    return None  # 제한 없음


def record_failed_registration(ip_address: str) -> int:
    """
    실패한 회원가입 시도를 기록합니다.
    """
    return registration_limiter.increment_attempts(ip_address, 'ip')


def clear_registration_attempts(ip_address: str) -> None:
    """
    성공한 회원가입 후 시도 횟수를 초기화합니다.
    """
    registration_limiter.clear_attempts(ip_address, 'ip')


def check_email_verification_resend_attempts(email: str, ip_address: str) -> Optional[str]:
    """
    이메일 인증 재전송 시도 횟수를 확인합니다.
    """
    # 이메일 기반 확인
    if email_verification_resend_limiter.is_blocked(email, 'email'):
        return email_verification_resend_limiter.get_lockout_message("이메일 인증 재전송")

    # IP 기반 확인
    if email_verification_resend_limiter.is_blocked(ip_address, 'ip'):
        return email_verification_resend_limiter.get_lockout_message("현재 IP에서 이메일 인증 재전송")

    return None  # 제한 없음


def record_failed_email_verification_resend(email: str, ip_address: str) -> Tuple[int, int]:
    """
    실패한 이메일 인증 재전송 시도를 기록합니다.
    """
    email_attempts = email_verification_resend_limiter.increment_attempts(email, 'email')
    ip_attempts = email_verification_resend_limiter.increment_attempts(ip_address, 'ip')

    return email_attempts, ip_attempts


def clear_email_verification_resend_attempts(email: str, ip_address: str) -> None:
    """
    성공한 이메일 인증 재전송 후 시도 횟수를 초기화합니다.
    """
    email_verification_resend_limiter.clear_attempts(email, 'email')
    email_verification_resend_limiter.clear_attempts(ip_address, 'ip')


# 추가 유틸리티 함수들
def check_email_change_request_attempts(user_identifier: str, ip_address: str) -> Optional[str]:
    """이메일 변경 '요청' 시도 제한 확인 (사용자 + IP)"""
    if email_change_request_limiter.is_blocked(user_identifier, 'user'):
        return email_change_request_limiter.get_lockout_message("이메일 변경 요청")
    if email_change_request_limiter.is_blocked(ip_address, 'ip'):
        return email_change_request_limiter.get_lockout_message("현재 IP에서 이메일 변경 요청")
    return None


def record_failed_email_change_request(user_identifier: str, ip_address: str) -> Tuple[int, int]:
    user_attempts = email_change_request_limiter.increment_attempts(user_identifier, 'user')
    ip_attempts = email_change_request_limiter.increment_attempts(ip_address, 'ip')
    return user_attempts, ip_attempts


def clear_email_change_request_attempts(user_identifier: str, ip_address: str) -> None:
    email_change_request_limiter.clear_attempts(user_identifier, 'user')
    email_change_request_limiter.clear_attempts(ip_address, 'ip')


def check_email_change_resend_attempts(new_email: str, ip_address: str) -> Optional[str]:
    """이메일 변경 '재전송' 시도 제한 확인 (새 이메일 + IP)"""
    if email_change_resend_limiter.is_blocked(new_email, 'email'):
        return email_change_resend_limiter.get_lockout_message("이메일 변경 재전송")
    if email_change_resend_limiter.is_blocked(ip_address, 'ip'):
        return email_change_resend_limiter.get_lockout_message("현재 IP에서 이메일 변경 재전송")
    return None


def record_failed_email_change_resend(new_email: str, ip_address: str) -> Tuple[int, int]:
    email_attempts = email_change_resend_limiter.increment_attempts(new_email, 'email')
    ip_attempts = email_change_resend_limiter.increment_attempts(ip_address, 'ip')
    return email_attempts, ip_attempts


def clear_email_change_resend_attempts(new_email: str, ip_address: str) -> None:
    email_change_resend_limiter.clear_attempts(new_email, 'email')
    email_change_resend_limiter.clear_attempts(ip_address, 'ip')


# ============================================
# 즐겨찾기/휴지통 rate limiting 함수들
# ============================================

def check_favorite_toggle_attempts(user_id: int) -> Optional[str]:
    """즐겨찾기 토글 시도 횟수를 확인합니다 (사용자 기반)."""
    if favorite_toggle_limiter.is_blocked(str(user_id), 'user'):
        return favorite_toggle_limiter.get_lockout_message("즐겨찾기 토글")
    return None


def record_favorite_toggle_attempt(user_id: int) -> int:
    """즐겨찾기 토글 시도를 기록합니다."""
    return favorite_toggle_limiter.increment_attempts(str(user_id), 'user')


def check_trash_action_attempts(user_id: int) -> Optional[str]:
    """휴지통 작업 시도 횟수를 확인합니다 (사용자 기반)."""
    if trash_action_limiter.is_blocked(str(user_id), 'user'):
        return trash_action_limiter.get_lockout_message("휴지통 작업")
    return None


def record_trash_action_attempt(user_id: int) -> int:
    """휴지통 작업 시도를 기록합니다."""
    return trash_action_limiter.increment_attempts(str(user_id), 'user')


# ============================================
# 소셜 이메일 인증 rate limiting 함수들
# ============================================

def check_social_email_submit_attempts(ip_address: str) -> Optional[str]:
    """소셜 이메일 입력 시도 횟수를 확인합니다 (IP 기반)."""
    if social_email_submit_limiter.is_blocked(ip_address, 'ip'):
        return social_email_submit_limiter.get_lockout_message("소셜 이메일 입력")
    return None


def record_social_email_submit_attempt(ip_address: str) -> int:
    """소셜 이메일 입력 시도를 기록합니다."""
    return social_email_submit_limiter.increment_attempts(ip_address, 'ip')


def check_social_email_verify_attempts(ip_address: str) -> Optional[str]:
    """소셜 이메일 인증 시도 횟수를 확인합니다 (IP 기반)."""
    if social_email_verify_limiter.is_blocked(ip_address, 'ip'):
        return social_email_verify_limiter.get_lockout_message("소셜 이메일 인증")
    return None


def record_social_email_verify_attempt(ip_address: str) -> int:
    """소셜 이메일 인증 시도를 기록합니다."""
    return social_email_verify_limiter.increment_attempts(ip_address, 'ip')


def check_social_email_resend_attempts(ip_address: str) -> Optional[str]:
    """소셜 이메일 재전송 시도 횟수를 확인합니다 (IP 기반)."""
    if social_email_resend_limiter.is_blocked(ip_address, 'ip'):
        return social_email_resend_limiter.get_lockout_message("소셜 이메일 재전송")
    return None


def record_social_email_resend_attempt(ip_address: str) -> int:
    """소셜 이메일 재전송 시도를 기록합니다."""
    return social_email_resend_limiter.increment_attempts(ip_address, 'ip')


def check_social_email_status_attempts(ip_address: str) -> Optional[str]:
    """소셜 이메일 상태 확인 시도 횟수를 확인합니다 (IP 기반)."""
    if social_email_status_limiter.is_blocked(ip_address, 'ip'):
        return social_email_status_limiter.get_lockout_message("소셜 이메일 상태 확인")
    return None


def record_social_email_status_attempt(ip_address: str) -> int:
    """소셜 이메일 상태 확인 시도를 기록합니다."""
    return social_email_status_limiter.increment_attempts(ip_address, 'ip')


def get_remaining_attempts(limiter_type: str, identifier: str, key_type: str) -> int:
    """
    남은 시도 횟수를 반환합니다.
    """
    limiter_map = {
        'login': login_limiter,
        'password_reset': password_reset_limiter,
        'registration': registration_limiter,
        'email_verification_resend': email_verification_resend_limiter,
        'email_change_request': email_change_request_limiter,
        'email_change_resend': email_change_resend_limiter
    }

    limiter = limiter_map.get(limiter_type)
    if not limiter:
        raise ValueError(f"Unknown limiter type: {limiter_type}")

    current_attempts = limiter.get_attempts(identifier, key_type)
    return max(0, limiter.max_attempts - current_attempts)


def get_lockout_time_remaining(limiter_type: str, identifier: str, key_type: str) -> Optional[int]:
    """
    제한 해제까지 남은 시간(초)을 반환합니다.
    정확한 TTL을 얻기 위해서는 Redis 등의 캐시 백엔드가 필요합니다.
    """
    limiter_map = {
        'login': login_limiter,
        'password_reset': password_reset_limiter,
        'registration': registration_limiter,
        'email_verification_resend': email_verification_resend_limiter,
        'email_change_request': email_change_request_limiter,
        'email_change_resend': email_change_resend_limiter
    }

    limiter = limiter_map.get(limiter_type)
    if not limiter or not limiter.is_blocked(identifier, key_type):
        return None

    # Django의 기본 캐시는 TTL을 직접 조회하는 방법이 제한적입니다.
    # Redis를 사용하는 경우 cache._cache.get_client().ttl(key) 등으로 조회 가능
    return limiter.lockout_duration  # 최대 제한 시간 반환


def get_lockout_minutes(limiter_type: str) -> int:
    """
    제한 시간을 분 단위로 반환합니다.
    """
    limiter_map = {
        'login': login_limiter,
        'password_reset': password_reset_limiter,
        'registration': registration_limiter,
        'email_verification_resend': email_verification_resend_limiter,
        'email_change_request': email_change_request_limiter,
        'email_change_resend': email_change_resend_limiter
    }

    limiter = limiter_map.get(limiter_type)
    if not limiter:
        raise ValueError(f"Unknown limiter type: {limiter_type}")

    # 모든 경우에 분 단위로 반환
    return limiter.lockout_duration // 60  # 초를 분으로 변환
