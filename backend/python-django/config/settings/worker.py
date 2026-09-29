"""
Worker 전용 Django 설정
웹 관련 앱과 미들웨어를 제거한 최소 설정
"""

from .base import *

# Worker에 필요한 앱만 포함
INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',

    # Local apps (User 모델 때문에 accounts 필요)
    'apps.accounts',
    'apps.notes',

    # 알림 태스크 처리에 필요한 앱
    'apps.support',
    'apps.notifications',
]

# Worker에 불필요한 미들웨어 제거
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
]

# REST Framework 설정 제거 (Worker에서 불필요)
REST_FRAMEWORK = {}

# CORS 설정 제거
CORS_ALLOWED_ORIGINS = []

# 인증 백엔드 최소화
AUTHENTICATION_BACKENDS = (
    'django.contrib.auth.backends.ModelBackend',
)

# Template 설정 (이메일 템플릿 렌더링에 필요)
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],  # 이메일 템플릿 경로
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.contrib.auth.context_processors.auth',
            ],
        },
    },
]

# Static files 설정 최소화
STATIC_URL = '/static/'

# URL 설정 비활성화 (Worker에 불필요)
ROOT_URLCONF = None

# Worker 전용 로깅
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} [{name}] {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'celery': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'gpu_worker': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'celery_workers': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Worker 전용 설정
CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = False

print("✓ Worker 전용 설정 로드 완료")
