import os

# 로컬 개발 기본값 - 환경변수 파일 없이도 구동 가능하도록
# 실제 환경변수가 있으면 그쪽이 우선됨 (setdefault)
os.environ.setdefault('SECRET_KEY', 'local-dev-only-not-for-production')

# Database (ArrayField 때문에 SQLite 불가, PostgreSQL 필요)
os.environ.setdefault('DB_ENGINE', 'django.db.backends.postgresql')
os.environ.setdefault('DB_NAME', 'opennote')
os.environ.setdefault('DB_USER', 'opennote')
os.environ.setdefault('DB_PASSWORD', 'opennote_dev')
os.environ.setdefault('DB_HOST', 'localhost')
os.environ.setdefault('DB_PORT', '5432')

from .base import *

DEBUG = True
ALLOWED_HOSTS = ['*']

# 이메일 → 콘솔 출력
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
