# Celery 워커 로그 운영 가이드

STT·요약 워커가 남기는 JSON 로그의 포맷과, 그 위에서 장애를 추적하는 방법을 정리한다.

구현은 [`celery_workers/logging_config.py`](../backend/python-django/celery_workers/logging_config.py),
수집 설정은 [`celery_workers/promtail-config.yml`](../backend/python-django/celery_workers/promtail-config.yml)에 있다.

## 로그 파일

워커 진입점이 `setup_async_logging('<worker_type>')`을 호출하면서 파일이 결정된다
(`stt_worker.py`, `summary_worker.py`).

| 파일 | 내용 | 기록 레벨 |
|---|---|---|
| `stt_worker.log` | STT 워커 | INFO 이상 |
| `summary_worker.log` | 요약 워커 | INFO 이상 |
| `beat.log` | Beat 스케줄러 | INFO 이상 |
| `celery_errors.log` | 전 워커 공통 에러 | ERROR 이상 |

경로는 `CELERY_LOG_DIR` 환경변수로 바꿀 수 있고, 기본값은 `backend/python-django/logs/`다.
Promtail은 컨테이너 안에서 `/var/log/celery/` 기준으로 위 4개를 긁는다.

## 로테이션 — 별도 설정이 필요 없다

**`logrotate`를 붙이지 말 것.** 로테이션은 이미 두 겹으로 돌고 있고, 여기에 `logrotate`를
얹으면 파일을 옮긴 뒤에도 파이썬 핸들러가 열린 fd로 계속 쓰기 때문에 로그가 유실된다.

1. **파일 로그** — `RotatingFileHandler`가 프로세스 내에서 처리한다.
   워커 로그는 100MB × backup 5, `celery_errors.log`는 100MB × backup 10.
2. **컨테이너 stdout** — compose의 `json-file` 드라이버가 10MB × 3으로 따로 돈다
   (`docker-compose.yml`의 `x-logging`).

## 로그 포맷

JSON Lines로 한 줄에 한 이벤트가 들어간다.

```json
{
  "timestamp": "2026-01-15T10:30:00.123456+09:00",
  "level": "INFO",
  "logger": "celery_workers.tasks.stt_tasks",
  "message": "STT processing started",
  "task_id": "abc123-def456",
  "note_id": 42,
  "worker_type": "stt",
  "extra": {
    "file_path": "/media/audio/recording.mp3",
    "duration": 120.5
  }
}
```

| 필드 | 설명 |
|-----|-----|
| timestamp | ISO 8601 타임스탬프 |
| level | DEBUG / INFO / WARNING / ERROR / CRITICAL |
| logger | 로거 이름 (모듈 경로) |
| message | 로그 메시지 |
| task_id | Celery 태스크 ID |
| note_id | 처리 중인 노트 ID |
| worker_type | 워커 타입 (stt, summary) |
| extra | 태스크별 추가 컨텍스트 |

`python-json-logger`가 없는 환경에서는 평문 포맷터로 자동 폴백하므로,
아래 `jq` 레시피가 동작하지 않으면 그 의존성부터 확인한다.

## jq 검색

### 기본

```bash
# 모든 에러
jq 'select(.level == "ERROR")' stt_worker.log

# 특정 노트의 전체 로그
jq 'select(.note_id == 123)' stt_worker.log

# 특정 태스크를 워커 전체에서 추적
cat *.log | jq 'select(.task_id == "abc123-def456")'
```

### 시간 범위

```bash
jq 'select(.timestamp >= "2026-01-15T10:00:00")' stt_worker.log

jq 'select(.timestamp >= "2026-01-15T10:00:00" and .timestamp <= "2026-01-15T11:00:00")' stt_worker.log

# 최근 1시간 (GNU date)
HOUR_AGO=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)
jq --arg t "$HOUR_AGO" 'select(.timestamp >= $t)' stt_worker.log
```

### 패턴

```bash
jq 'select(.message | test("error"; "i"))' stt_worker.log

jq 'select(.logger | startswith("celery_workers.tasks"))' stt_worker.log

# GPU 관련만
jq 'select(.message | test("GPU|CUDA|memory"; "i"))' stt_worker.log
```

### 집계

```bash
# 레벨별 건수
jq -s 'group_by(.level) | map({level: .[0].level, count: length})' stt_worker.log

# 시간대별 에러 건수
jq -s '[.[] | select(.level == "ERROR")] | group_by(.timestamp[:13])
       | map({hour: .[0].timestamp[:13], count: length})' stt_worker.log

# 빈발 에러 상위 10건
jq -s '[.[] | select(.level == "ERROR")] | group_by(.message)
       | map({message: .[0].message, count: length}) | sort_by(-.count) | .[0:10]' stt_worker.log
```

### grep으로 빠르게

JSON 파싱 없이 훑을 때:

```bash
grep '"level":"ERROR"' stt_worker.log
grep '"note_id":123' stt_worker.log
grep "$(date +%Y-%m-%d)" stt_worker.log
```

## 실시간 모니터링

```bash
# 에러만 흘려보기
tail -f stt_worker.log | jq 'select(.level == "ERROR")'

# 태스크 시작·완료
tail -f *.log | jq 'select(.message | test("started|completed"; "i"))'
```

컨테이너로 도는 워커는 파일 대신 `docker logs -f <container>`로도 같은 내용을 볼 수 있다.

## 트러블슈팅

### 실패한 태스크 추적

```bash
# 1) 에러가 난 태스크 ID 목록
cat *.log | jq 'select(.level == "ERROR" and .task_id)' | jq -s 'unique_by(.task_id) | .[].task_id'

# 2) 해당 태스크의 타임라인
TASK_ID="abc123"
cat *.log | jq -r --arg tid "$TASK_ID" \
  'select(.task_id == $tid) | "\(.timestamp) [\(.level)] \(.message)"' | sort

# 3) 스택트레이스
cat celery_errors.log | jq -r --arg tid "$TASK_ID" \
  'select(.task_id == $tid) | .extra.traceback'
```

### 처리 시간 분석

```bash
# 평균 처리 시간
jq 'select(.extra.duration) | .extra.duration' stt_worker.log | jq -s 'add / length'

# 오래 걸린 태스크 상위 5건
jq 'select(.extra.duration)' stt_worker.log \
  | jq -s 'sort_by(-.extra.duration) | .[0:5] | .[] | {task_id, duration: .extra.duration, note_id}'
```

## 주의

- **민감 정보**: 로그에 사용자 음성·본문이 들어가지 않도록 주의한다. 로그는 Loki로 수집되어
  보존 기간 동안 남는다.
- **디스크**: JSON 로그는 평문보다 용량이 크다. 위 로테이션 상한(워커당 최대 약 600MB,
  에러 로그 약 1.1GB)을 디스크 여유와 비교해 둘 것.
- **권한**: 컨테이너가 uid 1000으로 돌므로, 호스트 바인드마운트를 쓰면 로그 디렉터리
  소유자를 맞춰야 워커가 기록할 수 있다.
