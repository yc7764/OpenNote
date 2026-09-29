"""
소셜 계정 관리용 Rate Limiting 클래스
"""
from rest_framework.throttling import UserRateThrottle


class SocialUnlinkThrottle(UserRateThrottle):
    """소셜 계정 해제 Rate Limiting: 시간당 5회"""
    scope = 'social_unlink'


class AccountMergeThrottle(UserRateThrottle):
    """계정 병합 Rate Limiting: 시간당 3회"""
    scope = 'account_merge'


class SetPasswordThrottle(UserRateThrottle):
    """비밀번호 설정 Rate Limiting: 시간당 5회"""
    scope = 'set_password'
