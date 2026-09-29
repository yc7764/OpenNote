"""
토큰 관련 유틸리티 함수
"""
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()


def create_email_verification_token(user) -> str:
    """
    이메일 인증 완료 토큰을 생성합니다.
    """
    # 환경 변수에서 토큰 만료 시간 가져오기 (기본값: 10분)
    token_expiry_minutes = getattr(settings, 'EMAIL_VERIFICATION_TOKEN_EXPIRY_MINUTES', 10)

    # 이메일은 payload에 넣지 않는다 — JWT는 서명만 될 뿐 암호화되지 않아
    # 토큰을 얻은 누구나 디코드할 수 있다. 소비처(EmailVerificationTokenView)는
    # user_id로 DB에서 조회한다.
    payload = {
        'user_id': user.id,
        'type': 'email_verification_complete',
        'exp': datetime.now(timezone.utc) + timedelta(minutes=token_expiry_minutes)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')


def create_email_verification_request_token(user) -> str:
    """
    이메일 인증 요청 토큰을 생성합니다 (로그인 시 이메일 인증이 필요한 경우).
    """
    # 환경 변수에서 토큰 만료 시간 가져오기 (기본값: 10분)
    token_expiry_minutes = getattr(settings, 'EMAIL_VERIFICATION_TOKEN_EXPIRY_MINUTES', 10)

    # 이메일 미포함 — 위 create_email_verification_token과 동일한 이유
    payload = {
        'user_id': user.id,
        'type': 'email_verification_request',
        'exp': datetime.now(timezone.utc) + timedelta(minutes=token_expiry_minutes)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')


def verify_email_verification_token(token: str) -> Optional[Dict[str, Any]]:
    """
    이메일 인증 토큰을 검증합니다 (완료 토큰과 요청 토큰 모두 처리).
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])

        # 토큰 타입 확인 (완료 토큰과 요청 토큰 모두 허용)
        token_type = payload.get('type')
        if token_type not in ['email_verification_complete', 'email_verification_request']:
            return None

        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_user_from_verification_token(token: str):
    """
    인증 토큰에서 사용자를 가져옵니다.
    """
    payload = verify_email_verification_token(token)
    if not payload:
        return None

    try:
        return User.objects.get(id=payload['user_id'])
    except User.DoesNotExist:
        return None
