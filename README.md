# OpenNote V2

AI 음성 노트 웹 애플리케이션 — 음성 파일을 업로드하면 STT(음성 인식)와 AI 요약을 자동으로 처리하고, 실시간 협업 편집까지 지원합니다.

## 아키텍처 개요

```
┌───────────────────────────────────────────────────────────┐
│                  Frontend (Next.js :3000)                 │
└──────────────┬──────────────────────────┬─────────────────┘
               │                          │
        REST API (HTTP)            WebSocket (실시간)
               │                          │
               ▼                          ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│    Django REST API       │  │   sttEdit (NestJS WS)    │
│    - 인증/노트 CRUD       │  │   - 실시간 협업 편집        │
│    - 파일 업로드           │  │   - 상태 브로드캐스트      │
│    :8000                 │  │   :21123                 │
└──┬──────────────┬────────┘  └──────┬───────────────────┘
   │              │                  │
   │              │                  │ Redis Pub/Sub
   │              │                  │ (이벤트 전달)
   ▼              ▼                  ▼
┌──────────┐  ┌──────────────┐  ┌───────────────┐
│ RabbitMQ │  │  PostgreSQL  │◄─│     Redis     │
│ (작업 큐) │  │  (공유 DB)    │  │ (캐시/Pub/Sub)│
│ :5672    │  │  :5432       │  │ :6379         │
└────┬─────┘  └──────▲───────┘  └───────────────┘
     │               │
     │ Task Queue    │ 결과 저장
     ▼               │
┌─────────────────┐  │
│  Celery Workers ├──┘
│  - GPU (STT)    │
│  - CPU (요약)    │
└─────────────────┘
```

## 핵심 기능

- **인증**: JWT(HttpOnly 쿠키 + 헤더), 소셜 로그인(Google/GitHub/Naver/Kakao), 계정 연동/병합
- **보안**: CSRF 쿠키, 브루트포스 방지(시도 제한), CORS, XSS 방지, Rate Limiting
- **음성 처리**: 업로드 → STT(Whisper) → AI 요약(LLM) → 완료
- **실시간 편집**: Socket.IO 기반 협업 편집, Redis Pub/Sub 동기화
- **노트 관리**: CRUD, 즐겨찾기, 휴지통/복원, 일괄 삭제, 오디오 스트리밍(Range 지원)
- **알림**: 실시간 알림 시스템, 읽음 처리
- **고객 지원**: FAQ, 문의 접수/이력 조회
- **모니터링**: Prometheus 메트릭, Promtail → Loki 로그 수집

## 모노레포 구조

```
OpenNote-V2/
├── frontend/                        # Next.js 14 (App Router) — UI
├── backend/
│   ├── python-django/               # Django REST API 서버
│   │   ├── apps/
│   │   │   ├── accounts/            # 인증/프로필/소셜/이메일 변경/쿼터
│   │   │   ├── notes/               # 노트 CRUD/오디오/즐겨찾기/휴지통
│   │   │   ├── notifications/       # 알림 시스템
│   │   │   ├── support/             # FAQ/문의
│   │   │   ├── common/              # 공통 유틸리티
│   │   │   └── core/                # 핵심 설정
│   │   ├── config/                  # Django 설정 (base/local/production/worker)
│   │   └── celery_workers/          # Celery 워커 (STT + Summary)
│   └── sttEdit/                     # NestJS WebSocket 서버 (실시간 편집)
├── docker-compose.yml               # 운영 Compose (GHCR 이미지, 역할별 profile)
├── docker-compose.dev.yml           # 로컬 개발 Compose (소스에서 빌드)
├── deploy/                          # 배포 스크립트·가이드·override 예시
└── docs/                            # 프로젝트 문서
```

각 서브 프로젝트의 상세 문서:
- [Frontend README](frontend/README.md) — Next.js 프론트엔드
- [Backend Django README](backend/python-django/README.md) — Django API 서버
- [sttEdit README](backend/sttEdit/README.md) — NestJS 실시간 편집 서버
- [Celery Workers README](backend/python-django/celery_workers/README.md) — GPU/CPU 워커

## 빠른 시작

### Docker로 시작 (권장)

```bash
# 1. 개발 환경 실행 (PostgreSQL, Redis, RabbitMQ 포함)
docker compose -f docker-compose.dev.yml up -d

# 2. DB 마이그레이션
docker compose -f docker-compose.dev.yml exec backend uv run python manage.py migrate

# 3. 관리자 계정 생성
docker compose -f docker-compose.dev.yml exec backend uv run python manage.py createsuperuser
```

개발 환경에서 시작되는 서비스:
| 서비스 | 포트 | 설명 |
|--------|------|------|
| Frontend | 3000 | Next.js 앱 |
| Backend | 8000 | Django API |
| sttEdit | 21123 | WebSocket 서버 |
| PostgreSQL | 5432 | 데이터베이스 |
| Redis | 6379 | 캐시/Pub/Sub |
| RabbitMQ | 5672, 15672 | Celery 브로커 (관리 UI: 15672) |

### 수동 설치

#### 사전 요구사항
- Python 3.11+, Node.js 20+, PostgreSQL 16, Redis 7

#### 백엔드 (Django)
```bash
cd backend/python-django

# uv 사용 (권장)
uv sync
uv run python manage.py migrate
uv run python manage.py runserver

# 또는 pip
pip install -e .
python manage.py migrate
python manage.py runserver
```

#### 프론트엔드 (Next.js)
```bash
cd frontend
npm ci
npm run dev
```

#### 실시간 편집 서버 (sttEdit)
```bash
cd backend/sttEdit
npm install
npm run start:dev
```

## 환경변수

각 서비스별 환경변수는 개별 README를 참고하세요.

- [Backend Django 환경변수](backend/python-django/README.md#환경변수)
- [Frontend 환경변수](frontend/README.md#환경변수-env-local)
- [sttEdit 환경변수](backend/sttEdit/README.md#환경변수-설정)

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, SWR, Socket.IO Client |
| Backend API | Django 5.1, DRF, dj-rest-auth, allauth, SimpleJWT |
| 실시간 편집 | NestJS, TypeORM, Socket.IO, Redis Pub/Sub |
| Task Queue | Celery, RabbitMQ (브로커), Redis (결과 백엔드) |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Storage | 로컬 / S3(MinIO) |
| 모니터링 | Prometheus, Promtail, Loki |
| 컨테이너 | Docker, Docker Compose |

## 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE)로 배포됩니다.
