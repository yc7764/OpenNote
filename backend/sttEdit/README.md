# OpenNote-v2: STT Edit Backend

실시간으로 여러 사용자가 하나의 노트를 함께 편집하고 공유할 수 있는 협업 노트 서비스입니다.
음성 인식 기반 콘텐츠의 편집과 초저지연 데이터 동기화를 통해 자연스러운 협업 경험을 제공합니다.

---

## 프로젝트 개요

이 프로젝트는 **실시간성**과 **확장성**에 초점을 맞춘 노트 협업 시스템입니다.
사용자는 동시에 하나의 노트를 열고, STT 기반 콘텐츠와 메타 정보를 수정할 수 있으며 변경 사항은 즉시 모든 참여자에게 반영됩니다.

Redis를 캐시이자 메시지 브로커로 활용하여 데이터베이스 직접 부하를 최소화했고,
Socket.IO 기반 양방향 통신으로 지연 없는 실시간 협업 환경을 구현했습니다.

---

## 핵심 특징

- 실시간 공동 편집 (STT 텍스트, 할 일, 주제, 요약, 키워드 등)
- Redis 기반 캐싱 및 Pub/Sub 구조
- Socket.IO 기반 실시간 브로드캐스팅
- DB 부하 최소화를 위한 비동기 영속화 구조
- 스케줄러를 통한 데이터 동기화 및 정합성 유지
- XSS 방지를 위한 HTML 엔티티 이스케이프
- Rate Limiting (분당 60회 제한)
- PostgreSQL FOR UPDATE 락을 통한 Race Condition 방지

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | Node.js, NestJS, TypeORM |
| Language | TypeScript |
| Database | PostgreSQL 16 |
| Real-time | Redis Cluster, Socket.IO |
| Container | Docker (Alpine 기반) |
| Version Control | Git |

---

## 시작하기

### 사전 준비
- [Node.js](https://nodejs.org/) (v20.0.0 이상)
- [npm](https://www.npmjs.com/)
- PostgreSQL 16
- Redis (Standalone 또는 Cluster)

### 설치 및 실행

1. **의존성 설치**
```bash
npm install
```

2. **환경변수 설정**
```bash
cp .env.example .env
# .env 파일 편집
```

3. **개발 모드 실행**
```bash
npm run start:dev
```

4. **프로덕션 빌드 및 실행**
```bash
npm run build
npm run start:prod
```

### Docker 실행

sttEdit 전용 compose는 없다. 저장소 루트의 compose를 쓴다.

```bash
# 로컬 개발 (소스에서 빌드): 저장소 루트에서
docker compose -f docker-compose.dev.yml up -d --build sttedit

# 운영 (GHCR 이미지): .env에 OPENNOTE_TAG와 COMPOSE_PROFILES=sttedit 지정 후
docker compose up -d
docker compose logs -f sttedit
```

운영 배포 절차는 [deploy/README.md](../../deploy/README.md)를 참고한다.

---

## 주요 기능

### 1. WebSocket 기반 실시간 통신

#### 연결 처리 파이프라인
클라이언트가 `/note` 네임스페이스로 연결 시 다음 단계를 거칩니다:

```
1. 인증 정보 추출 (Token, NoteId)
2. 필수 파라미터 검증
3. JWT 토큰 검증 + Note 소유권 확인
4. Redis에 세션 등록 (사용자당 최대 3개 연결)
5. Room 참가 및 초기 데이터 전송
```

#### 메시지 핸들러
| 이벤트 | 설명 |
|--------|------|
| `update` | 노트 데이터 수정 요청. Rate Limit 체크 → JWT 재검증 → noteId 권한 재검증 → XSS Sanitize → Redis 저장 → 브로드캐스트 |
| `status` | 작업 상태(편집 중 등) 업데이트 및 브로드캐스트 |

#### 멀티 인스턴스 지원
- Redis Pub/Sub을 통한 인스턴스 간 메시지 동기화
- 각 서버 인스턴스는 고유 UUID로 식별

---

### 2. Redis 클러스터 구조 및 키 설계

#### NAT Mapping 지원
클라우드/컨테이너 환경에서 Redis 클러스터 사용 시, 내부 IP와 외부 IP가 다른 경우를 위한 `natMap` 설정을 적용했습니다.

#### 3단계 인덱스 구조

| Level | 키 패턴 | 용도 |
|-------|--------|------|
| 1 | `note:index` | 활성 노트 ID 집합 (Set) |
| 2 | `note:{noteId}:segment:index` | 해당 노트의 세그먼트 ID 집합 |
| 2 | `note:{noteId}:summary_text:index` | 해당 노트의 섹션 ID 집합 |
| 3 | `note:{noteId}:segment:{segmentId}` | 실제 세그먼트 데이터 |
| 3 | `note:{noteId}:summary_text:{sectionId}` | 실제 요약 텍스트 데이터 |
| 3 | `note:{noteId}:keywords` 등 | 키워드, 다음 행동, 메인 토픽 데이터 |

---

### 3. 스케줄러 기반 자동 DB 동기화

60초마다 실행되는 스케줄러가 Redis 데이터를 DB에 저장합니다:

```
1. 분산 락 획득 (멀티 인스턴스 환경에서 중복 실행 방지)
2. note:index에서 활성 노트 목록 조회
3. 각 노트별로:
   - 세그먼트 인덱스 순회 → TTL < 60초인 항목 DB 저장
   - 요약 텍스트 인덱스 순회 → TTL < 60초인 항목 DB 저장
   - 키워드/다음 행동/메인 토픽 처리
4. 저장 성공 시 Redis 키 및 인덱스에서 제거
5. 저장 실패 시 TTL 90초로 연장 (재시도 기회 부여, 최대 5회)
6. 분산 락 해제
```

#### History 관리 (Race Condition 방지)
`HistoryManager` 유틸리티를 통해 PostgreSQL 트랜잭션 + FOR UPDATE 락으로 히스토리 레코드를 안전하게 관리합니다:
- 히스토리 레코드가 10개 이상이면 가장 오래된 것 삭제
- 새 히스토리 생성 및 메인 엔티티 업데이트를 원자적으로 처리

---

### 4. 보안 강화

#### CORS 설정
환경변수(`ALLOWED_ORIGINS`) 기반으로 허용 Origin을 동적 설정합니다.

#### JWT 검증 체계
| 검증 단계 | 시점 | 내용 |
|-----------|------|------|
| 연결 시 | `handleConnection` | 토큰 유효성 + Note 소유권 |
| 메시지 시 | `handleUpdate` | 토큰 재검증 + 만료 확인 + user_id 일치 + noteId 권한 재검증 |
| 저장 시 | `NoteService` | updatedBy와 note.userId 일치 확인 |

**noteId 권한 재검증**: 연결 시 인가된 noteId와 메시지 요청의 noteId를 비교하여, 다른 노트에 대한 무단 접근을 차단합니다.

#### XSS 방지
- HTML 특수문자(`<`, `>`, `&`, `"`, `'`)를 엔티티로 이스케이프
- 원본 텍스트 보존하면서 스크립트 실행 차단

#### Rate Limiting
- Redis Sliding Window 알고리즘 기반
- 분당 60회 요청 제한
- 초과 시 남은 시간(초) 포함한 에러 메시지 반환

#### 연결 수 제한
- 사용자당 최대 3개 연결
- 초과 시 가장 오래된 연결 자동 종료

---

### 5. 에러 코드 체계

| 코드 범위 | 분류 | 상세 코드 |
|-----------|------|-----------|
| `E1xxxx` | 네트워크 에러 | E10100: 네트워크 에러 |
| `E2xxxx` | Redis 관련 에러 | E20100: 저장 실패, E20200: Pub/Sub 실패, E20300: 연결 실패, E20400: 타임아웃 |
| `E3xxxx` | DB 관련 에러 | E30100: 업데이트 실패, E30200: 연결 실패, E30300: 트랜잭션 실패 |
| `E4xxxx` | 인증/인가 에러 | E40100: 유효하지 않은 토큰, E40101: 토큰 만료, E40200: 토큰 누락, E40201: noteId 누락, E40202: 사용자 불일치 |
| `E5xxxx` | 비즈니스 로직 에러 | E50100: 초기 데이터 조회 실패, E50200: 노트 접근 권한 없음 |
| `E6xxxx` | 데이터 검증 에러 | E60100: 데이터 타입 오류, E60101: 길이 초과, E60102: 필수 필드 누락, E60103: payload 구조 불일치, E60104: XSS 감지 |
| `E7xxxx` | Rate Limiting 에러 | E70100: 요청 빈도 초과 |
| `E8xxxx` | 연결 에러 | E80100: 연결 수 초과, E80200: 세션 만료 |
| `E9xxxx` | 재시도 에러 | E90100: 최대 재시도 횟수 초과 |

---

### 6. 커스텀 예외 클래스

비즈니스 로직에서 발생하는 예외를 명확하게 처리하기 위한 커스텀 예외 클래스를 제공합니다.

| 예외 클래스 | 에러 코드 | 용도 |
|-------------|-----------|------|
| `NotePermissionException` | E50200 | 노트 접근 권한이 없을 때 발생 |
| `InvalidKeyFormatException` | E60100 | 잘못된 키 형식일 때 발생 |
| `MissingDataException` | E60102 | 필수 데이터가 누락되었을 때 발생 |

---

## 데이터 흐름도

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│   Client    │ ◄─────────────────►│  WebSocket GW    │
└─────────────┘                    └────────┬─────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       ▼                       │
                    │              ┌────────────────┐               │
                    │              │     Redis      │               │
                    │              │  (TTL: 300s)   │               │
                    │              └────────┬───────┘               │
                    │                       │                       │
                    │         ┌─────────────┼─────────────┐         │
                    │         ▼             ▼             ▼         │
                    │   ┌──────────┐  ┌──────────┐  ┌──────────┐   │
                    │   │Instance 1│  │Instance 2│  │Instance 3│   │
                    │   │Scheduler │  │Scheduler │  │Scheduler │   │
                    │   └────┬─────┘  └──────────┘  └──────────┘   │
                    │        │ (분산 락으로 1개만 실행)              │
                    │        ▼                                      │
                    │   ┌──────────┐                                │
                    │   │PostgreSQL│                                │
                    │   └──────────┘                                │
                    └───────────────────────────────────────────────┘
```

---

## 환경변수 설정

### 필수 환경변수

애플리케이션 시작 시 필수 환경변수를 자동으로 검증합니다.
누락 시 명확한 에러 메시지와 함께 시작이 실패합니다.

#### 데이터베이스 (PostgreSQL)
| 변수명 | 설명 | 필수 |
|--------|------|:----:|
| `POSTGRES_HOST` | PostgreSQL 호스트 주소 | ✅ |
| `POSTGRES_PORT` | PostgreSQL 포트 번호 | ✅ |
| `POSTGRES_USERNAME` | 데이터베이스 사용자명 | ✅ |
| `POSTGRES_PASSWORD` | 데이터베이스 비밀번호 | ✅ |
| `POSTGRES_DATABASE` | 사용할 데이터베이스 이름 | ✅ |
| `DB_POOL_SIZE` | 커넥션 풀 크기 | |
| `DB_SSL` | SSL 연결 활성화 여부 | |
| `DB_SSL_REJECT_UNAUTHORIZED` | SSL 인증서 검증 여부 | |

#### Redis
| 변수명 | 설명 | 필수 |
|--------|------|:----:|
| `REDIS_MODE` | Redis 모드 (`standalone` 또는 `cluster`) | |
| `REDIS_HOST` | Standalone 모드: Redis 호스트 | |
| `REDIS_CLUSTER_NODES` | Cluster 모드: 노드 목록 (예: `host1:port1,host2:port2`) | |
| `REDIS_EXTERNAL_HOST` | NAT 환경: 외부 호스트 주소 | |
| `REDIS_PASSWORD` | Redis 비밀번호 | |

#### 서버 설정
| 변수명 | 설명 | 필수 |
|--------|------|:----:|
| `PORT` | 서버 포트 번호 (기본값: 3000) | |
| `ALLOWED_ORIGINS` | CORS 허용 origin 목록 | ✅ |
| `JWT_SECRET` | JWT 서명 키 | ✅ |
| `NODE_ENV` | 실행 환경 (`development`, `production`) | |

### .env 파일 예시

```bash
# Node Environment
NODE_ENV=development

# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=myuser
POSTGRES_PASSWORD=mypassword
POSTGRES_DATABASE=mydb

# Database Pool & SSL (Optional)
# DB_POOL_SIZE=10
# DB_SSL=true
# DB_SSL_REJECT_UNAUTHORIZED=false

# Redis Configuration
REDIS_MODE=standalone
REDIS_HOST=localhost:6379
# REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
# REDIS_EXTERNAL_HOST=external.host.com
# REDIS_PASSWORD=optional_password

# Server Configuration
PORT=21123
ALLOWED_ORIGINS=http://localhost:3000

# JWT Configuration
JWT_SECRET=your-secret-key
```

---

## 프로젝트 구조

```
sttEdit/
├── src/
│   ├── main.ts                           # 애플리케이션 시작점
│   ├── app.module.ts                     # 루트 모듈
│   │
│   ├── common/                           # 공통 리소스
│   │   ├── constants.enum.ts             # 상수 정의
│   │   ├── error-code.enum.ts            # 에러 코드 및 메시지
│   │   ├── exceptions/                   # 커스텀 예외
│   │   │   └── note.exceptions.ts        # 노트 관련 예외 클래스
│   │   └── utils/
│   │       └── history-manager.ts        # 히스토리 관리 유틸리티
│   │
│   ├── config/                           # 설정
│   │   ├── env.validation.ts             # 환경변수 검증
│   │   └── winston.config.ts             # 로깅 설정
│   │
│   ├── events/                           # 이벤트 정의
│   │   ├── events.module.ts
│   │   └── note.events.ts                # 노트 이벤트 타입
│   │
│   ├── jobs/                             # 배치 작업
│   │   └── updated-notes.job.ts          # 세그먼트 병합 스크립트
│   │
│   ├── note/                             # 노트 모듈
│   │   ├── note.module.ts
│   │   ├── note.controller.ts
│   │   ├── note.service.ts
│   │   └── entity/                       # 엔티티 정의
│   │       ├── note.entity.ts
│   │       ├── note-segment.entity.ts
│   │       ├── note-segment-history.entity.ts
│   │       ├── note-summary.entity.ts
│   │       ├── note-summary-history.entity.ts
│   │       ├── note-summary-section.entity.ts
│   │       └── note-summary-section-history.entity.ts
│   │
│   ├── redis/                            # Redis 모듈
│   │   ├── redis.module.ts
│   │   └── redis.service.ts
│   │
│   ├── scheduler/                        # 스케줄러 모듈
│   │   ├── scheduler.module.ts
│   │   └── note-scheduler.service.ts     # DB 동기화 스케줄러
│   │
│   └── websocket/                        # WebSocket 모듈
│       ├── websocket.module.ts
│       ├── websocket.server.ts           # WebSocket 게이트웨이
│       ├── websocket.connection.service.ts # 연결 관리 서비스
│       ├── websocket.validator.ts        # JWT 검증
│       ├── websocket.data-validator.ts   # 데이터 검증
│       ├── websocket.rate-limiter.ts     # Rate Limiting
│       ├── redis-pubsub.service.ts       # Pub/Sub 서비스
│       └── dto/
│           └── update-note.dto.ts        # DTO 및 XSS Sanitizer
│
├── Dockerfile                            # Docker 빌드 설정 (compose는 저장소 루트)
└── package.json
```

---

## 상수 설정 (constants.enum.ts)

| 상수명 | 값 | 설명 |
|--------|---|------|
| `SCHEDULER_LOCK_KEY` | `note-scheduler-lock` | 분산 락 키 |
| `SCHEDULER_LOCK_TTL` | 60 | 락 TTL (초) |
| `TTL_THRESHOLD_SECONDS` | 60 | DB 저장 트리거 TTL 임계값 |
| `TTL_EXTENSION_SECONDS` | 90 | 저장 실패 시 TTL 연장 |
| `MAX_HISTORY_RECORDS` | 10 | 최대 히스토리 레코드 수 |
| `NOTE_DATA_TTL_SECONDS` | 300 | 노트 데이터 TTL |
| `SESSION_MAX_AGE_SECONDS` | 3600 | 세션 유효 기간 (1시간) |
| `MAX_CONNECTIONS_PER_USER` | 3 | 사용자당 최대 연결 수 |
| `RATE_LIMIT_WINDOW_SECONDS` | 60 | Rate Limit 윈도우 (분) |
| `RATE_LIMIT_MAX_PER_MINUTE` | 60 | 분당 최대 요청 수 |
| `MAX_RETRY_COUNT` | 5 | 스케줄러 최대 재시도 횟수 |
| `RETRY_COUNT_TTL_SECONDS` | 600 | 재시도 카운터 TTL (10분) |
| `GLOBAL_SESSION_EXPIRY_KEY` | `global:session:expiry` | 전역 세션 만료 키 |
| `DISCONNECT_SOCKET_CHANNEL` | `disconnect-socket` | 소켓 종료 Pub/Sub 채널 |
