# 로컬 개발 환경 설정 가이드

Django 서버(`python-django`)와 NestJS 서버(`sttEdit`)를 로컬에서 실행하는 방법을 설명합니다.

---

## 전체 구조

```
docker-compose.dev.yml
├── PostgreSQL     (포트 5432)
├── Redis          (포트 6379)
├── RabbitMQ       (포트 5672, 15672)
├── backend        (포트 8000)  - Django REST API
├── sttEdit        (포트 21123) - NestJS WebSocket
└── frontend       (포트 3000)  - Next.js (프로덕션 빌드)
```

프로덕션 `docker-compose.yml`은 건드리지 않고, `docker-compose.dev.yml`로 개발 환경 전체를 실행합니다.

> **참고**: Docker의 frontend 서비스는 `npm run build` 기반 프로덕션 빌드입니다.
> 프론트엔드 코드를 수정하면서 hot reload가 필요하다면 [방법 2: 프론트엔드 직접 실행](#프론트엔드-frontend)을 사용하세요.

---

## 방법 1: Docker로 전체 실행 (권장)

### 1단계: 컨테이너 시작

```bash
# 프로젝트 루트에서
docker compose -f docker-compose.dev.yml up -d
```

별도의 `.env` 파일 없이 동작합니다. 환경변수는 `docker-compose.dev.yml`에 선언되어 있습니다.

컨테이너 상태 확인:
```bash
docker compose -f docker-compose.dev.yml ps
```

로그 확인:
```bash
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f sttEdit
```

### 2단계: DB 마이그레이션

```bash
docker compose -f docker-compose.dev.yml exec backend uv run python manage.py migrate
```

### 3단계: 관리자 계정 생성

```bash
docker compose -f docker-compose.dev.yml exec backend uv run python manage.py createsuperuser
```

### 서버 확인

- Frontend: http://localhost:3000
- Django API: http://localhost:8000
- Django Admin: http://localhost:8000/admin
- sttEdit WebSocket: ws://localhost:21123
- RabbitMQ Management UI: http://localhost:15672 (guest/guest)

---

## 방법 2: 앱 직접 실행 (디버깅/Hot reload)

인프라(PostgreSQL, Redis, RabbitMQ)만 Docker로 실행하고, 앱은 호스트에서 직접 실행합니다.

### 인프라만 시작

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis rabbitmq
```

---

### Django 서버 (`backend/python-django`)

#### 사전 요구사항

- Python 3.11+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
# uv 설치 (미설치 시)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

#### 1단계: 의존성 설치

```bash
cd backend/python-django
uv sync --python 3.11
```

#### 2단계: DB 마이그레이션

별도 `.env` 파일 없이 `config.settings.local`이 개발용 기본값을 자동 제공합니다.

```bash
cd backend/python-django
DJANGO_SETTINGS_MODULE=config.settings.local uv run python manage.py migrate
```

> **참고**: `notes/models.py`에서 `ArrayField`를 사용하므로 SQLite는 동작하지 않습니다.
> PostgreSQL 컨테이너가 실행 중이어야 합니다.

#### 3단계: 개발 서버 실행

```bash
DJANGO_SETTINGS_MODULE=config.settings.local uv run python manage.py runserver 0.0.0.0:8000
```

서버 확인: http://localhost:8000/admin

#### Celery 워커 실행 (STT/요약 기능 테스트 시)

RabbitMQ가 실행 중이어야 합니다.

```bash
# STT 워커
cd backend/python-django
DJANGO_SETTINGS_MODULE=config.settings.local uv run celery -A celery_workers.stt_worker worker \
  --queues stt_queue -c 1 --loglevel=info

# 요약 워커 (별도 터미널)
DJANGO_SETTINGS_MODULE=config.settings.local uv run celery -A celery_workers.summary_worker worker \
  --queues summary_queue -c 1 --loglevel=info

# Beat 스케줄러 (별도 터미널)
DJANGO_SETTINGS_MODULE=config.settings.local uv run celery -A config.celery_app beat --loglevel=info
```

#### 관리자 계정 생성

```bash
DJANGO_SETTINGS_MODULE=config.settings.local uv run python manage.py createsuperuser
```

---

### sttEdit 서버 (`backend/sttEdit`)

#### 사전 요구사항

- Node.js v20.0.0+
- npm

#### 1단계: 환경변수 설정

`backend/sttEdit/.env.local` 파일을 생성합니다 (`.env.local`이 `.env`보다 우선 로드됨):

```ini
NODE_ENV=development
PORT=21123

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=opennote
POSTGRES_PASSWORD=opennote_dev
POSTGRES_DATABASE=opennote

REDIS_MODE=STANDALONE
REDIS_HOST=localhost:6379

JWT_SECRET=local-dev-only-not-for-production
ALLOWED_ORIGINS=http://localhost:3000
```

> **중요**: `JWT_SECRET`은 Django `config.settings.local`의 기본값과 동일해야 합니다.

#### 2단계: 의존성 설치

```bash
cd backend/sttEdit
npm install
```

#### 3단계: 개발 서버 실행

```bash
npm run start:dev
```

Hot reload가 활성화된 상태로 실행됩니다. 서버 확인: `ws://localhost:21123`

---

### 프론트엔드 (`frontend`)

#### 사전 요구사항

- Node.js v20.0.0+
- npm

#### 1단계: 의존성 설치

```bash
cd frontend
npm install
```

#### 2단계: 환경변수 설정

`frontend/.env.local` 파일을 생성합니다:

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:21123
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_STT_EDIT_MODULE_URL=http://localhost:21123
```

#### 3단계: 개발 서버 실행

```bash
npm run dev
```

Hot reload가 활성화된 상태로 실행됩니다. 서버 확인: http://localhost:3000

---

## JWT 설정

Django가 발급한 JWT를 sttEdit WebSocket 연결 시 사용합니다. 두 서버의 `JWT_SECRET`이 반드시 일치해야 합니다.

| 항목 | Django (local.py 기본값) | sttEdit (docker-compose.dev.yml) |
|------|--------------------------|----------------------------------|
| JWT_SECRET | `local-dev-only-not-for-production` | `local-dev-only-not-for-production` |
| Algorithm | HS256 | HS256 |
| Access Token TTL | 60분 | 검증만 수행 (발급은 Django) |

---

## 개발 인프라 종료

```bash
docker compose -f docker-compose.dev.yml down

# 데이터도 함께 삭제하려면
docker compose -f docker-compose.dev.yml down -v
```

---

## 트러블슈팅

### Django: `ImproperlyConfigured: SECRET_KEY 환경 변수가 필요합니다`

`DJANGO_SETTINGS_MODULE=config.settings.local`이 설정되지 않았습니다.

### Django: DB 연결 오류

```bash
docker compose -f docker-compose.dev.yml ps   # postgres 상태 확인
docker compose -f docker-compose.dev.yml logs postgres
```

### sttEdit: Redis 연결 오류

`REDIS_MODE=STANDALONE`이 설정되어 있는지 확인하세요. 기본값이 `CLUSTER`이므로 미설정 시 연결에 실패합니다.

### sttEdit: `Connection refused` (Redis/PostgreSQL)

```bash
docker compose -f docker-compose.dev.yml ps   # 컨테이너 상태 확인
```

### JWT 인증 실패

Django의 `JWT_SECRET`과 sttEdit의 `JWT_SECRET`이 일치하는지 확인하세요.
