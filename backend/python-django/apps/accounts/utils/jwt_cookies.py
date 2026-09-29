"""
JWT HttpOnly 쿠키 설정 유틸리티

보안 고려사항:
- HttpOnly: JavaScript에서 쿠키 접근 불가 (XSS 방어)
- Secure: HTTPS에서만 쿠키 전송 (프로덕션)
- SameSite: CSRF 공격 방어
"""
from django.conf import settings
from rest_framework.response import Response


def get_jwt_cookie_settings():
    """
    REST_AUTH 설정에서 JWT 쿠키 설정값 추출

    Returns:
        dict: 쿠키 설정 딕셔너리
    """
    rest_auth = getattr(settings, 'REST_AUTH', {})

    return {
        'httponly': rest_auth.get('JWT_AUTH_HTTPONLY', True),
        'secure': rest_auth.get('JWT_AUTH_SECURE', False),
        'samesite': rest_auth.get('JWT_AUTH_SAMESITE', 'Lax'),
        'access_cookie_name': rest_auth.get('JWT_AUTH_COOKIE', 'access_token'),
        'refresh_cookie_name': rest_auth.get('JWT_AUTH_REFRESH_COOKIE', 'refresh_token'),
        # 토큰 수명 (초 단위)
        'access_token_lifetime': int(
            rest_auth.get('ACCESS_TOKEN_LIFETIME',
                          getattr(settings, 'SIMPLE_JWT', {}).get('ACCESS_TOKEN_LIFETIME',
                                  __import__('datetime').timedelta(minutes=60))).total_seconds()
        ),
        'refresh_token_lifetime': int(
            rest_auth.get('REFRESH_TOKEN_LIFETIME',
                          getattr(settings, 'SIMPLE_JWT', {}).get('REFRESH_TOKEN_LIFETIME',
                                  __import__('datetime').timedelta(days=7))).total_seconds()
        ),
    }


def set_jwt_cookies(response: Response, access_token: str, refresh_token: str = None) -> Response:
    """
    Response 객체에 JWT 토큰을 HttpOnly 쿠키로 설정

    Args:
        response: DRF Response 객체
        access_token: JWT access token 문자열
        refresh_token: JWT refresh token 문자열 (선택)

    Returns:
        Response: 쿠키가 설정된 Response 객체
    """
    cookie_settings = get_jwt_cookie_settings()

    # Access Token 쿠키 설정
    response.set_cookie(
        key=cookie_settings['access_cookie_name'],
        value=access_token,
        max_age=cookie_settings['access_token_lifetime'],
        httponly=cookie_settings['httponly'],
        secure=cookie_settings['secure'],
        samesite=cookie_settings['samesite'],
        path='/',
    )

    # Refresh Token 쿠키 설정 (있는 경우)
    if refresh_token:
        response.set_cookie(
            key=cookie_settings['refresh_cookie_name'],
            value=refresh_token,
            max_age=cookie_settings['refresh_token_lifetime'],
            httponly=cookie_settings['httponly'],
            secure=cookie_settings['secure'],
            samesite=cookie_settings['samesite'],
            path='/',
        )

    return response


def clear_jwt_cookies(response: Response) -> Response:
    """
    Response 객체에서 JWT 쿠키 제거 (로그아웃 시 사용)

    Args:
        response: DRF Response 객체

    Returns:
        Response: 쿠키가 제거된 Response 객체
    """
    cookie_settings = get_jwt_cookie_settings()

    response.delete_cookie(
        key=cookie_settings['access_cookie_name'],
        path='/',
        samesite=cookie_settings['samesite'],
    )
    response.delete_cookie(
        key=cookie_settings['refresh_cookie_name'],
        path='/',
        samesite=cookie_settings['samesite'],
    )

    return response


def set_jwt_cookies_for_user(response: Response, user) -> Response:
    """
    사용자 객체로부터 JWT 토큰을 생성하고 쿠키로 설정

    Args:
        response: DRF Response 객체
        user: Django User 객체

    Returns:
        Response: JWT 쿠키가 설정된 Response 객체
    """
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(user)

    return set_jwt_cookies(
        response,
        access_token=str(refresh.access_token),
        refresh_token=str(refresh)
    )
