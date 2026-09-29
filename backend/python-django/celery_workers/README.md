# Celery Workers

OpenNote v2의 GPU/CPU 워커 분리 아키텍처입니다.

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│                      Django API                             │
│                  (Task 발행 & 상태 관리)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Redis Broker                             │
│              stt_queue │ summary_queue │ dlq_queue          │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐      ┌─────────────────────┐
│    STT Worker       │      │   Summary Worker    │
│  (GPU, concurrency=1)│      │  (CPU, concurrency=4)│
│   Whisper Large V3  │      │    OpenAI API       │
└─────────────────────┘      └─────────────────────┘
```

## Celery 앱 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                         Celery 앱 구조                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  config/celery_app.py          Django 통합, Beat 스케줄러        │
│       │                        (API에서 Task 호출 시 사용)        │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              celery_workers/ (Worker 전용)               │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                         │   │
│  │  stt_worker.py ◄─── STT Worker 실행 시 사용              │   │
│  │    (GPU, concurrency=1)                                 │   │
│  │                                                         │   │
│  │  summary_worker.py ◄─── Summary Worker 실행 시 사용       │   │
│  │    (CPU, concurrency=4)                                 │   │
│  │                                                         │   │
│  │  (celery_app.py 삭제됨)                                  │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 디렉토리 구조

```
celery_workers/
├── __init__.py
├── # celery_app.py 삭제됨 (stt_worker.py, summary_worker.py 사용)
├── stt_worker.py          # STT 전용 워커 앱 ⭐
├── summary_worker.py      # Summary 전용 워커 앱 ⭐
├── logging_config.py      # 비동기 JSON 로깅
├── heartbeat.py           # 워커 헬스체크
├── recovery.py            # 실패 태스크 복구
├── signals.py             # Celery 시그널 핸들러
├── schemas.py             # Pydantic 입력 스키마
├── utils.py               # Whisper 모델 로딩
├── tasks/
│   ├── __init__.py        # 하위호환 re-export
│   ├── base.py            # GPUTask 베이스 클래스
│   ├── stt_tasks.py       # STT 처리 태스크
│   └── summary_tasks.py   # Summary 처리 태스크
├── Dockerfile.stt         # GPU 이미지 (~10GB)
├── Dockerfile.summary     # CPU 이미지 (~500MB)
├── docker-compose.dev.yml # 개발 환경
├── docker-compose.prod.yml# 프로덕션 환경
├── run_stt_worker.py      # STT 워커 실행 스크립트
├── run_summary_worker.py  # Summary 워커 실행 스크립트
└── requirements-summary.txt # Summary 워커 의존성
```

## 빠른 시작

### 개발 환경

```bash
# 1. 환경 변수 설정
cp celery_workers/.env.example celery_workers/.env
# .env 파일 편집하여 필요한 값 설정

# 2. Docker Compose로 실행
cd celery_workers
docker-compose -f docker-compose.dev.yml up -d

# 3. 로그 확인
docker-compose -f docker-compose.dev.yml logs -f stt-worker
docker-compose -f docker-compose.dev.yml logs -f summary-worker
```

### 로컬 실행 (개발용)

```bash
# STT Worker
cd backend/python-django
python celery_workers/run_stt_worker.py

# Summary Worker (별도 터미널)
python celery_workers/run_summary_worker.py

# Beat Scheduler (별도 터미널)
celery -A config.celery_app beat --loglevel=info
```

### 프로덕션 배포

```bash
# 1. 이미지 빌드
docker build -f celery_workers/Dockerfile.stt -t opennote/stt-worker:latest .
docker build -f celery_workers/Dockerfile.summary -t opennote/summary-worker:latest .

# 2. Docker Compose로 실행
cd celery_workers
docker-compose -f docker-compose.prod.yml up -d

# 또는 systemd 서비스로 실행
sudo cp deploy/stt-worker.service /etc/systemd/system/
sudo cp deploy/summary-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable stt-worker summary-worker
sudo systemctl start stt-worker summary-worker
```

## 워커 설정

### STT Worker

| 설정 | 값 | 설명 |
|-----|---|-----|
| concurrency | 1 | GPU 메모리 최적화 |
| prefetch_multiplier | 1 | Task 하나씩 처리 |
| max_tasks_per_child | 10 | GPU 메모리 누수 방지 |
| time_limit | 7200s | 2시간 (대용량 파일 처리) |
| queue | stt_queue | 전용 큐 |

### Summary Worker

| 설정 | 값 | 설명 |
|-----|---|-----|
| concurrency | 4 | I/O 병렬 처리 |
| prefetch_multiplier | 4 | 효율적 배칭 |
| max_tasks_per_child | 100 | CPU 워커는 더 많이 처리 |
| time_limit | 600s | 10분 |
| queue | summary_queue | 전용 큐 |

## Task 호출 방법

### Django에서 호출 (권장: send_task)

```python
from celery import current_app as celery_app

# STT 처리 요청 (send_task 방식 - worker 임포트 불필요)
result = celery_app.send_task(
    'celery_workers.tasks.stt_tasks.process_stt',
    args=[note.id],
    kwargs={'duration_seconds': 3600},
    queue='stt_queue'
)

# Summary 처리 요청
result = celery_app.send_task(
    'celery_workers.tasks.summary_tasks.process_summary',
    args=[note.id],
    queue='summary_queue'
)

# 결과 확인
status = result.status  # PENDING, STARTED, SUCCESS, FAILURE
```

### 직접 임포트 방식 (테스트용)

```python
from celery_workers.tasks import process_stt, process_summary

result = process_stt.delay(note_id=note.id)
```

### Task 상태 추적

```python
from apps.notes.models import ProcessingTask

# Task 상태 조회
task = ProcessingTask.objects.get(celery_task_id=result.id)
print(f"Status: {task.status}, Progress: {task.progress}%")
```

## 모니터링

### Flower (Celery 모니터링 UI)

```bash
# 개발 환경에서 자동 시작
# http://localhost:5555 접속

# 수동 시작
celery -A config.celery_app flower --port=5555
```

### 헬스체크 API

```bash
# 워커 상태 확인
curl http://localhost:8000/api/health/workers/

# 응답 예시
{
  "stt_worker": {
    "status": "healthy",
    "last_heartbeat": "2024-01-15T10:30:00Z",
    "tasks_completed": 150
  },
  "summary_worker": {
    "status": "healthy",
    "last_heartbeat": "2024-01-15T10:30:05Z",
    "tasks_completed": 145
  }
}
```

### 로그 검색

```bash
# JSON 로그에서 특정 note_id 검색
cat logs/stt_worker.log | jq 'select(.note_id == 123)'

# 에러 로그만 필터링
cat logs/summary_worker.log | jq 'select(.level == "ERROR")'

# 특정 시간대 로그
cat logs/*.log | jq 'select(.timestamp >= "2024-01-15T10:00:00")'
```

## 장애 복구

### Stuck Task 복구

```bash
# 자동 복구 (Beat에서 5분마다 실행)
celery -A config.celery_app call celery_workers.recovery.recover_stuck_tasks

# 수동 복구
python manage.py shell
>>> from celery_workers.recovery import recover_stuck_tasks
>>> recover_stuck_tasks()
```

### DLQ 처리

```bash
# Dead Letter Queue 확인
celery -A config.celery_app call celery_workers.recovery.process_dlq

# 수동 재시도
python manage.py shell
>>> from apps.notes.models import ProcessingTask
>>> failed_tasks = ProcessingTask.objects.filter(status='FAILED')
>>> for task in failed_tasks:
...     task.retry()
```

### 워커 재시작

```bash
# Graceful restart (현재 task 완료 후)
docker-compose -f docker-compose.prod.yml restart stt-worker

# 강제 재시작
docker-compose -f docker-compose.prod.yml kill stt-worker
docker-compose -f docker-compose.prod.yml up -d stt-worker
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|-----|-------|-----|
| REDIS_URL | redis://redis:6379/0 | Redis 연결 URL |
| DATABASE_URL | - | PostgreSQL 연결 URL |
| WHISPER_MODEL | large-v3 | Whisper 모델 크기 |
| WHISPER_COMPUTE_TYPE | float16 | GPU 연산 타입 |
| OPENAI_API_KEY | - | OpenAI API 키 |
| LOG_LEVEL | INFO | 로그 레벨 |
| STT_HARD_TIME_LIMIT | 7200 | STT 타임아웃 (초) |
| SUMMARY_TIMEOUT_MINUTES | 10 | Summary 타임아웃 (분) |
| WORKER_MAX_TASKS | 10 | max_tasks_per_child |

## 트러블슈팅

### GPU 메모리 부족

```bash
# 현재 GPU 사용량 확인
nvidia-smi

# 해결책:
# 1. WHISPER_MODEL을 medium 또는 small로 변경
# 2. WHISPER_COMPUTE_TYPE을 int8로 변경
# 3. 워커 재시작으로 메모리 정리
```

### Task가 처리되지 않음

```bash
# 1. 큐 상태 확인
celery -A config.celery_app inspect active_queues

# 2. 워커 연결 상태 확인
celery -A config.celery_app inspect ping

# 3. 메시지 대기 상태 확인
redis-cli LLEN stt_queue
```

### 로그가 생성되지 않음

```bash
# 1. 로그 디렉토리 권한 확인
ls -la logs/

# 2. 로그 디렉토리 생성
mkdir -p logs
chmod 755 logs

# 3. 워커 재시작
docker-compose restart stt-worker summary-worker
```

## 마이그레이션 가이드

기존 `gpu_worker`에서 `celery_workers`로 마이그레이션이 완료되었습니다.

### 새 Task 이름 (현재 사용)

```python
# STT Task
'celery_workers.tasks.stt_tasks.process_stt'

# Summary Task
'celery_workers.tasks.summary_tasks.process_summary'
```

### 삭제된 레거시 이름

다음 레거시 Task 이름은 더 이상 지원되지 않습니다:
- ~~`gpu_worker.tasks.process_stt`~~ → 삭제됨
- ~~`gpu_worker.tasks.process_summary`~~ → 삭제됨

> **주의**: 레거시 이름으로 전송된 Task는 라우팅되지 않습니다.

## 참고 문서

- [Celery 공식 문서](https://docs.celeryq.dev/)
- [faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper)
- [OpenNote Architecture](/docs/architecture.md)
