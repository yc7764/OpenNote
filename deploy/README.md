# 배포 가이드

운영 서버는 소스를 갖지 않는다. CI가 GHCR에 올린 이미지를 받아 실행만 한다.

```
main 머지 ─▶ CI(ci.yml): 테스트 → 이미지 빌드 → ghcr.io/yc7764/opennote-{backend,sttedit,frontend}:sha-<커밋>
개발 PC  ─▶ deploy/deploy.sh <역할> <태그> ─SSH─▶ 서버: pull → (마이그레이션 확인) → up → 헬스체크
```

## 이미지와 태그

| 태그 | 붙는 시점 |
|---|---|
| `sha-<커밋 7자리>` | `main`에 머지될 때마다 CI가 테스트 통과 후 자동으로 |
| `v1.xxx` | 릴리스 git 태그를 push하면 같은 이미지에 이름만 추가(재빌드 없음) |

- 운영에는 둘 중 하나만 쓴다. `latest`는 만들지 않는다.
- 세 이미지(backend·sttedit·frontend)는 항상 같은 태그로 배포한다. 프론트와 백엔드를 같이 바꿔야 하는 변경이 있어서다.
- Celery 워커 이미지는 CI에서 만들지 않는다(GPU 이미지, 수동 배포).

## 역할

`docker-compose.yml`의 서비스는 역할(profile)로 묶여 있다. 서버 `.env`의 `COMPOSE_PROFILES`로 그 서버에서 띄울 역할을 고른다.

| 역할 | 서비스 |
|---|---|
| `api` | backend, redis-cache, promtail |
| `sttedit` | sttedit, promtail-sttedit |
| `gateway` | frontend |

한 서버에 전부 띄우려면 `COMPOSE_PROFILES=api,sttedit,gateway`.

## 서버 준비 (최초 1회)

배포 폴더(예: `/opt/opennote`)에 아래만 둔다.

```
/opt/opennote/
├── .env                          # 값·시크릿. .env.example 참고, 이 서버 역할에 필요한 키만
├── docker-compose.override.yml   # (선택) 서버 전용 구조 — 인증서 마운트, 호스트 별칭
└── certs/                        # (선택) DB·브로커 TLS 인증서
```

`docker-compose.yml`과 promtail 설정은 `deploy.sh`가 배포할 버전의 것을 복사하므로 직접 두지 않는다.

**`.env` 필수 키**

- `OPENNOTE_TAG` — `deploy.sh`가 관리한다
- `COMPOSE_PROFILES` — 이 서버의 역할
- `api`·`sttedit` 역할은 `BACKEND_BIND`·`STTEDIT_BIND`를 **반드시 명시**한다. 게이트웨이가 다른 서버면 `0.0.0.0`(호스트 방화벽에서 게이트웨이만 허용), 같은 서버면 `127.0.0.1`. 비어 있으면 `deploy.sh`가 멈춘다.
- `api` 역할은 `METRICS_ALLOWED_IPS`에 Prometheus 수집 출발지를 넣는다. 없으면 `/metrics`가 403.

**override**

값은 `.env`에, override에는 환경변수로 표현할 수 없는 구조만 둔다. 예시: [docker-compose.override.example.yml](docker-compose.override.example.yml). 실제 파일은 저장소에 넣지 않는다(`.gitignore` 처리).

**리버스 프록시가 별도 compose인 경우**

앱 네트워크 이름은 `opennote-network`로 고정돼 있다. 같은 서버의 다른 compose(nginx 등)는 이 이름을 external 네트워크로 붙으면 `opennote-frontend:3000`으로 접근할 수 있다.

```yaml
networks:
  opennote-network:
    external: true
```

## 개발 PC 준비

서버 목록 파일 `~/.config/opennote/deploy-hosts`를 만든다(저장소 밖, 경로는 `OPENNOTE_DEPLOY_HOSTS`로 변경 가능).

```
# <역할>  <user@host>          <ssh 키>                  <배포 폴더>
api       ubuntu@203.0.113.10  ~/.ssh/opennote-api.key   /opt/opennote
sttedit   ubuntu@203.0.113.11  ~/.ssh/opennote-stt.key   /opt/opennote
gateway   ubuntu@203.0.113.12  ~/.ssh/opennote-gw.key    /opt/opennote
```

## 배포

```bash
deploy/deploy.sh all sha-abc1234 --check   # 사전 점검만 (아무것도 바꾸지 않음)
deploy/deploy.sh all sha-abc1234           # sttedit → api → gateway 순서
deploy/deploy.sh api v1.005                # 한 역할만
```

스크립트가 하는 일:

1. 태그 이미지가 GHCR에 있는지 확인
2. 서버 `.env` 점검 — 역할, `*_BIND` 명시 여부
3. 이전 버전 대비 `.env.example`에 새로 생긴 키 안내, 워커가 쓰는 모델 변경 경고
4. 서버의 `.env`·compose·override를 `.deploy-backups/<시각>/`에 백업
5. 배포할 버전의 compose·promtail 설정 복사, 새 이미지 pull
6. (api) 마이그레이션 확인 — 아래 참고
7. `.env`의 `OPENNOTE_TAG` 교체 후 `docker compose up -d`, 헬스체크 대기(최대 3분)

## 마이그레이션

- 적용할 마이그레이션이 **없으면** 그대로 진행한다(대부분의 배포).
- **있으면** 목록을 보여주고, `pg_dump`로 서버의 `backups/`에 DB를 백업한 뒤, `y`를 입력해야 적용한다. `N`이면 실행 중인 버전과 `.env`는 바뀌지 않는다.
- 이미지를 되돌려도 DB 스키마는 되돌아가지 않는다. 그래서 마이그레이션은 **이전 버전 코드도 새 스키마에서 동작하도록** 작성한다. 예: 컬럼 삭제는 "코드에서 사용 중단 → 다음 릴리스에서 삭제"로 나눈다.

## 되돌리기

```bash
deploy/deploy.sh <역할> <이전 태그>
```

이전 태그는 배포 로그와 `.deploy-backups/`의 `.env`에 남아 있다.

## Celery 워커

자동 배포 대상이 아니다. 워커 장비에서 `backend/python-django/celery_workers/docker-compose.yml`로 직접 빌드·실행한다. 워커는 Django 모델을 직접 쓰므로, `deploy.sh`가 notes·notifications 모델 변경을 경고하면 워커도 같은 버전으로 재배포한다.

## 소스 기반 배포에서 전환할 때

기존에 서버에서 `git pull` 후 빌드하던 경우의 1회성 절차.

1. 새 배포 폴더를 만들고 기존 `.env`·인증서를 옮긴다. 기존 compose에서 직접 고친 부분은 override로 옮긴다.
2. `.env`에 `OPENNOTE_TAG`, `COMPOSE_PROFILES`, 필요한 `*_BIND`를 추가한다.
3. `deploy.sh <역할> <태그> --check`로 점검한다.
4. 새 이미지를 미리 받아 둔 뒤(`OPENNOTE_TAG=<태그> docker compose pull`) 기존 컨테이너를 내리고 `deploy.sh`로 올린다. 컨테이너 이름이 같아서 기존 것을 먼저 내려야 한다.
5. 다른 compose가 앱 네트워크에 붙어 있었다면 external 네트워크 이름을 `opennote-network`로 바꾼다.
6. 정상 확인 후 서버의 소스 폴더와 GitHub 자격증명을 지운다.
