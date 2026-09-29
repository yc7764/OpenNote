# backend/python-django/Dockerfile
# Django Backend Server - Ubuntu 22.04 + uv sync 기반 초고속 빌드

FROM ubuntu:22.04 AS base

WORKDIR /app

# 시스템 패키지 및 타임존 설정
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    tzdata \
    libpq-dev \
    libmagic1 \
    ffmpeg \
 && ln -snf /usr/share/zoneinfo/Asia/Seoul /etc/localtime \
 && echo "Asia/Seoul" > /etc/timezone \
 && dpkg-reconfigure -f noninteractive tzdata \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# uv 설치 — 핀 고정된 공식 이미지에서 바이너리 복사(체크섬 검증된 재현 빌드).
# 이전엔 `curl ... install.sh | sh`라 스크립트 무결성 검증 없이 root 임의 코드 실행 경로였다.
COPY --from=ghcr.io/astral-sh/uv:0.12.1 /uv /uvx /usr/local/bin/

# uv가 설치하는 Python을 공용 경로에 둔다 — 기본값(/root/.local)은 비-root
# 사용자가 접근할 수 없어 venv 인터프리터 로드가 실패한다(No module named 'encodings').
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python

# Python 3.11 설치
RUN uv python install 3.11

# 의존성 파일 먼저 복사 (레이어 캐싱 최적화)
COPY pyproject.toml uv.lock ./

# uv sync로 의존성 설치 (--frozen: uv.lock 그대로 설치, 재현 가능한 빌드)
RUN uv sync --frozen --python 3.11 --no-install-project --extra web

# 애플리케이션 코드 복사
COPY . .

# 로그 디렉토리 생성
RUN mkdir -p /app/logs /app/staticfiles

# 정적 파일 수집 (빌드 시 한 번만 실행)
# SECRET_KEY는 collectstatic에 필요하지만 실제 값은 런타임에 주입됨
RUN SECRET_KEY=build-time-dummy-key uv run python manage.py collectstatic --noinput

# 보안: 비-root 사용자로 실행
# 호스트 logs/ 바인드마운트 소유자(uid 1000)와 맞춰 로그 쓰기가 되도록 uid 1000 고정
RUN groupadd -g 1000 appuser \
 && useradd -u 1000 -g 1000 -m -s /bin/bash appuser \
 && chown -R appuser:appuser /app /opt/uv-python
USER appuser

# 환경변수 설정
ENV PYTHONUNBUFFERED=1
# 기본값을 production으로 둔다. base는 Secure 쿠키·HSTS·SSL 리다이렉트·
# LocMemCache 기동가드가 모두 빠진 설정이라, .env 누락 시 조용히 비보안 상태로
# 뜨는 fail-open이 된다. production이면 설정이 모자랄 때 기동이 실패한다.
# (로컬 개발은 docker-compose.dev.yml이 config.settings.local을 명시한다)
ENV DJANGO_SETTINGS_MODULE=config.settings.production
ENV PATH="/app/.venv/bin:${PATH}"

# 포트 노출
EXPOSE 8000

# Gunicorn으로 Django 서버 실행 (gevent worker)
CMD ["gunicorn", "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--worker-class", "gevent", \
     "--worker-connections", "200", \
     "--timeout", "300", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "config.wsgi:application"]
