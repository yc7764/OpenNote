# OpenNote V2 — Django Backend

Django REST Framework 기반 API 서버. 인증, 노트 관리, 음성 처리 파이프라인, 알림, 고객 지원 기능을 제공합니다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Django 5.1, DRF 3.16 |
| 인증 | dj-rest-auth, allauth, SimpleJWT |
| Database | PostgreSQL 16, psycopg2 |
| Cache | Redis (django-redis) |
| Task Queue | Celery 5.5, RabbitMQ |
| Storage | 로컬 / S3(MinIO, django-storages + boto3) |
| Server | Gunicorn, WhiteNoise |
| 모니터링 | django-prometheus, python-json-logger |
| 보안 | python-magic (파일 검증), cryptography, defusedxml |

## 디렉토리 구조

```
python-django/
├── apps/
│   ├── accounts/              # 인증/프로필/소셜 로그인/이메일 변경/쿼터
│   │   ├── views/             # auth, email_change, email_verification,
│   │   │                      # password, profile, quota, social, social_auth,
│   │   │                      # social_connect, social_management
│   │   ├── services/          # helpers, social_linking
│   │   ├── models.py          # User (커스텀), EmailChangeToken
│   │   ├── serializers.py     # 인증/프로필/소셜 직렬화
│   │   ├── throttles.py       # 브루트포스 방지 제한
│   │   └── validators.py      # 입력 검증
│   ├── notes/                 # 노트 CRUD, 오디오 스트리밍, 즐겨찾기, 휴지통
│   │   ├── views.py           # note_list, note_create, note_detail, note_delete,
│   │   │                      # note_delete_multiple, play_audio, toggle_favorite,
│   │   │                      # trash_list, restore_note, permanent_delete, empty_trash,
│   │   │                      # retry_expired_note, task_status
│   │   ├── models.py          # Note, Summary, SummarySection, ProcessingTask
│   │   ├── signals.py         # 노트 삭제 시 오디오 파일 자동 삭제
│   │   ├── s3_client.py       # S3/MinIO 클라이언트
│   │   └── urls.py            # 노트 API 라우팅
│   ├── notifications/         # 알림 시스템
│   │   ├── views.py           # 목록, 읽지 않은 수, 읽음 처리
│   │   ├── models.py          # Notification
│   │   ├── services/email.py  # 이메일 알림
│   │   └── tasks.py           # 비동기 알림 태스크
│   ├── support/               # 고객 지원
│   │   ├── views.py           # FAQ 목록, 문의 생성/이력/상태
│   │   ├── models.py          # FAQ, ContactInquiry
│   │   ├── services/email.py  # 문의 이메일 발송
│   │   └── fixtures/          # 초기 FAQ 데이터
│   ├── common/                # 공통 유틸리티
│   │   └── logging_utils.py
│   └── core/                  # 핵심 설정
├── config/
│   ├── settings/
│   │   ├── base.py            # 공통 설정
│   │   ├── local.py           # 로컬 개발 설정
│   │   ├── production.py      # 운영 설정
│   │   ├── worker.py          # Celery 워커 설정
│   │   └── celery.py          # Celery 설정
│   ├── celery_app.py          # Celery 앱 (Django 통합)
│   ├── exception_handler.py   # 전역 예외 처리
│   ├── logging_formatters.py  # 로그 포맷터
│   └── urls.py                # URL 라우팅
├── celery_workers/            # Celery 워커 (별도 README 참고)
├── templates/emails/          # 이메일 템플릿
├── deploy/                    # 배포 설정 (Promtail 등)
├── pyproject.toml             # 의존성 정의 (uv/hatch)
└── manage.py
```

## 설치 및 실행

### uv 사용 (권장)

```bash
cd backend/python-django

# 의존성 설치
uv sync

# 마이그레이션
uv run python manage.py migrate

# 관리자 계정 생성
uv run python manage.py createsuperuser

# 개발 서버 실행
uv run python manage.py runserver
```

### pip 사용

```bash
pip install -e .
python manage.py migrate
python manage.py runserver
```

### Docker

```bash
# 루트 디렉토리에서
docker compose -f docker-compose.dev.yml up backend -d
docker compose -f docker-compose.dev.yml exec backend uv run python manage.py migrate
```

## 환경변수

`backend/python-django/.env` 또는 루트 `.env`에서 설정합니다.

### Django 핵심

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `SECRET_KEY` | — | Django 시크릿 키 (필수) |
| `DEBUG` | `False` | 디버그 모드 |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | 허용 호스트 |
| `DJANGO_SETTINGS_MODULE` | `config.settings.local` | 설정 모듈 |

### 데이터베이스

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DB_HOST` | `localhost` | PostgreSQL 호스트 |
| `DB_PORT` | `5432` | PostgreSQL 포트 |
| `POSTGRES_USER` | `opennote` | DB 사용자 |
| `POSTGRES_PASSWORD` | — | DB 비밀번호 |
| `POSTGRES_DB` | `opennote` | DB 이름 |

### 캐시 & 큐

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CACHE_BACKEND` | `locmem` | 캐시 백엔드 (`locmem` / `redis`) |
| `REDIS_URL` | `redis://127.0.0.1:6379/1` | Redis URL |
| `CELERY_BROKER_URL` | — | RabbitMQ 브로커 URL |
| `CELERY_RESULT_BACKEND` | — | Celery 결과 백엔드 |

### 이메일 (SMTP)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `EMAIL_HOST` | `smtp.gmail.com` | SMTP 호스트 |
| `EMAIL_PORT` | `587` | SMTP 포트 |
| `EMAIL_USE_TLS` | `True` | TLS 사용 |
| `EMAIL_HOST_USER` | — | SMTP 사용자 |
| `EMAIL_HOST_PASSWORD` | — | SMTP 앱 비밀번호 |
| `DEFAULT_FROM_EMAIL` | — | 발신 이메일 |

### CORS / CSRF

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | CORS 허용 오리진 |
| `CSRF_TRUSTED_ORIGINS` | `http://localhost:3000` | CSRF 신뢰 오리진 |

### JWT

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ACCESS_TOKEN_LIFETIME_MINUTES` | `60` | 액세스 토큰 유효 시간 |
| `REFRESH_TOKEN_LIFETIME_DAYS` | `1` | 리프레시 토큰 유효 시간 |

### 시도 제한 (브루트포스 방지)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `LOGIN_ATTEMPT_LIMIT` | `5` | 로그인 시도 제한 |
| `LOGIN_LOCKOUT_DURATION` | `300` | 잠금 시간 (초) |
| `PASSWORD_RESET_ATTEMPT_LIMIT` | `3` | 비밀번호 재설정 시도 제한 |
| `REGISTRATION_ATTEMPT_LIMIT` | `5` | 회원가입 시도 제한 |
| `EMAIL_VERIFICATION_RESEND_LIMIT` | `1` | 이메일 인증 재전송 제한 |
| `EMAIL_CHANGE_REQUEST_LIMIT` | `5` | 이메일 변경 요청 제한 |

### 스토리지

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `USE_S3` | `False` | S3 스토리지 사용 여부 |
| `AWS_ACCESS_KEY_ID` | — | S3 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | — | S3 시크릿 키 |
| `AWS_STORAGE_BUCKET_NAME` | — | S3 버킷 이름 |

### 프론트엔드 URL

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `NEXT_PUBLIC_FRONTEND_URL` | `http://localhost:3000` | 프론트엔드 URL (이메일 링크 등) |

## API 엔드포인트

### 인증 (`/api/auth/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/login/` | 로그인 (JWT 발급) |
| POST | `/api/auth/logout/` | 로그아웃 |
| POST | `/api/auth/registration/` | 회원가입 |
| POST | `/api/auth/token/refresh/` | JWT 토큰 갱신 |

### 비밀번호 (`/api/auth/password/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/password/reset/` | 비밀번호 재설정 이메일 발송 |
| POST | `/api/auth/password/reset/validate/` | 재설정 토큰 유효성 검증 |
| POST | `/api/auth/password/reset/confirm/` | 비밀번호 재설정 확인 |
| POST | `/api/auth/change-password/` | 비밀번호 변경 (인증 필요) |
| POST | `/api/auth/password/set/` | 비밀번호 설정 (소셜 전용 계정) |

### 이메일 인증 (`/api/auth/email/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/auth/email/verify-status/` | 인증 상태 확인 |
| POST | `/api/auth/email/verify-token/` | 토큰으로 인증 완료 |
| POST | `/api/auth/email/resend/` | 인증 이메일 재발송 |

### 이메일 변경 (`/api/auth/email/change/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/email/change/request/` | 이메일 변경 요청 |
| POST | `/api/auth/email/change/resend/` | 변경 인증 재발송 |
| POST | `/api/auth/email/change/cancel/` | 변경 취소 |
| GET | `/api/auth/email/change/status/` | 변경 상태 확인 |

### 소셜 로그인 (`/api/auth/social/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/social/google/` | Google 로그인 |
| POST | `/api/auth/social/github/` | GitHub 로그인 |
| POST | `/api/auth/social/naver/` | Naver 로그인 |
| POST | `/api/auth/social/kakao/` | Kakao 로그인 |
| POST | `/api/auth/social/<provider>/connect/` | 소셜 계정 연결 |
| POST | `/api/auth/social/<provider>/disconnect/` | 소셜 계정 연결 해제 |
| POST | `/api/auth/social/submit-email/` | 소셜 이메일 제출 |
| POST | `/api/auth/social/verify-email/` | 소셜 이메일 인증 |
| POST | `/api/auth/social/resend-email/` | 소셜 이메일 재발송 |
| GET | `/api/auth/social/verify-status/` | 소셜 이메일 인증 상태 |

### 프로필 (`/api/auth/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/auth/profile/` | 프로필 조회 |
| PATCH | `/api/auth/profile/` | 프로필 수정 |
| POST | `/api/auth/delete-account/` | 계정 삭제 |
| GET | `/api/auth/profile/linked-accounts/` | 연동된 소셜 계정 목록 |
| POST | `/api/auth/social/unlink/<provider>/` | 소셜 계정 연동 해제 |
| POST | `/api/auth/accounts/merge/` | 계정 병합 |

### 쿼터 (`/api/accounts/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/accounts/quota/` | 사용량/쿼터 조회 |

### 노트 (`/api/notes/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/notes/` | 노트 목록 |
| POST | `/api/notes/create/` | 노트 생성 (오디오 업로드, 1GB 제한) |
| GET | `/api/notes/<id>/` | 노트 상세 |
| DELETE | `/api/notes/<id>/delete/` | 노트 삭제 (휴지통으로) |
| POST | `/api/notes/delete-multiple/` | 노트 일괄 삭제 |
| GET | `/api/notes/<id>/play/` | 오디오 스트리밍 (Range 지원) |
| POST | `/api/notes/<id>/favorite/` | 즐겨찾기 토글 |
| GET | `/api/notes/trash/` | 휴지통 목록 |
| POST | `/api/notes/<id>/restore/` | 노트 복원 |
| DELETE | `/api/notes/<id>/permanent-delete/` | 영구 삭제 |
| POST | `/api/notes/empty-trash/` | 휴지통 비우기 |
| POST | `/api/notes/<id>/retry/` | 만료 노트 재처리 |
| GET | `/api/notes/<id>/status/` | 처리 상태 조회 |

### 고객 지원 (`/api/support/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/support/faq/` | FAQ 목록 |
| POST | `/api/support/contact/` | 문의 접수 |
| GET | `/api/support/contact/history/` | 문의 이력 |
| GET | `/api/support/contact/status/` | 문의 상태 |

### 알림 (`/api/notifications/`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/notifications/` | 알림 목록 |
| GET | `/api/notifications/unread-count/` | 읽지 않은 알림 수 |
| POST | `/api/notifications/read-all/` | 모든 알림 읽음 처리 |
| POST | `/api/notifications/<uuid>/read/` | 단일 알림 읽음 처리 |

### 모니터링

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/metrics` | Prometheus 메트릭 (IP 화이트리스트, 기본 루프백만) |

`/metrics`는 `METRICS_ALLOWED_IPS`(쉼표 구분 IP·CIDR, 기본 `127.0.0.1,::1`)에 등록된
출발지만 접근할 수 있다. 판정은 프록시 헤더가 아니라 TCP 접속원(`REMOTE_ADDR`)을 보므로,
스크레이퍼가 nginx나 도커 브리지를 거쳐 들어오면 그 홉의 IP를 등록해야 한다.
`METRICS_ENABLED=false`로 두면 엔드포인트를 404로 감춘다.

## 데이터 모델

### accounts.User (커스텀)
커스텀 사용자 모델 — allauth 소셜 계정 연동 지원

### notes.Note
| 필드 | 타입 | 설명 |
|------|------|------|
| `title` | CharField(20) | 노트 제목 |
| `content` | JSONField | STT 결과 (세그먼트 배열) |
| `duration` | DurationField | 오디오 길이 |
| `is_recording` | BooleanField | 녹음 여부 |
| `processing_status` | CharField | `processing` / `summarizing` / `completed` |
| `preview` | TextField | 미리보기 텍스트 |
| `audio_file` | FileField | 오디오 파일 (`notes/audio/%Y/%m/%d/uuid.ext`) |
| `summary` | FK → Summary | 요약 |
| `is_favorite` | BooleanField | 즐겨찾기 |
| `is_deleted` | BooleanField | 소프트 삭제 (휴지통) |

### notes.Summary / notes.SummarySection
요약 데이터 — 주제, 키워드, 다음 행동, 섹션별 요약

### notes.ProcessingTask
Celery 태스크 상태 추적 — `celery_task_id`, `status`, `progress`

삭제 시: `Summary`/`SummarySection` CASCADE 삭제, 시그널로 오디오 파일 자동 삭제

## 음성 처리 파이프라인

```
1. 업로드 → Note 생성 (processing_status='processing', preview='음성 인식 중...')
2. Celery STT Task 발행 → stt_queue → STT Worker (Whisper)
3. STT 완료 → content/segments 채움 → processing_status='summarizing'
4. Celery Summary Task 발행 → summary_queue → Summary Worker (OpenAI)
5. 요약 완료 → Summary/SummarySection 생성 → processing_status='completed'
```

Celery 워커에 대한 상세 정보: [celery_workers/README.md](celery_workers/README.md)

## 관리자 페이지

`/admin/` 에서 Django 관리자 페이지에 접근할 수 있습니다.

- **Accounts**: 사용자, 이메일 인증, 소셜 계정
- **Notes**: 노트, 요약, 요약 섹션, 처리 태스크
- **Notifications**: 알림
- **Support**: FAQ, 문의

## 개발 가이드

### 환경변수 우선순위
1. 환경변수 (`.env` 파일)
2. 기본값 (`settings.py`에 정의)

### 설정 모듈
- `config.settings.base` — 공통 설정
- `config.settings.local` — 로컬 개발 (DEBUG=True, locmem 캐시)
- `config.settings.production` — 운영 (HTTPS, Redis 캐시, S3 스토리지)
- `config.settings.worker` — Celery 워커 전용 설정
