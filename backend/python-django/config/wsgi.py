"""WSGI config with gevent monkey patching for OpenNote

gevent monkey patching은 반드시 다른 import보다 먼저 실행되어야 합니다.
이를 통해 표준 라이브러리의 blocking I/O를 non-blocking으로 변환합니다.

For more information on this file, see
https://docs.djangoproject.com/en/5.1/howto/deployment/wsgi/
"""

# 1. gevent monkey patching (반드시 최상단!)
from gevent import monkey
monkey.patch_all()

# 2. psycopg2 gevent 호환성 패치
# psycopg2는 libpq(C 라이브러리)를 사용하므로 별도 패치 필요
from psycogreen.gevent import patch_psycopg
patch_psycopg()

# 3. Django 설정
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.production')

application = get_wsgi_application()
