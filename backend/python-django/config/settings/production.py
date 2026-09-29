from django.core.exceptions import ImproperlyConfigured
from .base import *

DEBUG = False

# 운영에서 프로세스별 LocMemCache는 레이트리밋·캐시가 워커 간 공유되지 않아
# 다중 워커 브루트포스 방어가 무력화된다. 공유 캐시(redis)가 아니면 기동을 실패시킨다.
if CACHES['default']['BACKEND'].endswith('LocMemCache'):
    raise ImproperlyConfigured(
        "운영 환경에서 LocMemCache는 워커 간 공유되지 않아 레이트리밋이 무력화됩니다. "
        "환경변수 CACHE_BACKEND=redis 를 설정하세요."
    )

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# 앱 레벨 HTTPS 강제 (심층방어 — nginx가 이미 HTTPS·HSTS를 적용 중).
# base.py에 SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO','https')가 있어
# 프록시(nginx) 뒤에서도 무한 리다이렉트가 발생하지 않는다.
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000  # 1년 (INCLUDE_SUBDOMAINS·PRELOAD은 base.py에서 True)
REST_AUTH = {
    **REST_AUTH,
    'JWT_AUTH_SECURE': True,
}

# allauth 이메일 인증 보안 설정
# base.py의 'none' (커스텀 인증 시스템용)을 운영 환경에서도 명시적으로 유지하되,
# allauth 기본 경로를 통한 인증 우회 방지를 위해 추가 설정 적용
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS = 1  # EmailVerification.is_valid() 의 24시간과 일치

# 운영에서 DRF Browsable API(HTML) 렌더러를 비활성화한다.
# base.py는 DEFAULT_RENDERER_CLASSES 미설정 → DRF 기본값(JSON + BrowsableAPI)이라
# Accept: text/html 요청 시 로그인 폼·API 구조·필드가 공개 노출된다(엔드포인트 열거 표면).
# 운영은 JSON만 응답한다. (개발 편의를 위한 BrowsableAPI는 local.py에서 유지)
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
}