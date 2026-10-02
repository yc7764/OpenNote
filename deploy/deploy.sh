#!/usr/bin/env bash
# =============================================================================
# OpenNote 배포 스크립트 — 운영 서버에 SSH로 접속해 GHCR 이미지를 받아 교체한다.
#
# 사용법:
#   deploy/deploy.sh <역할|all> <태그> [--check]
#     역할 : api | sttedit | gateway | all (all은 sttedit → api → gateway 순서)
#     태그 : sha-<커밋 7자리> 또는 v1.xxx (CI가 GHCR에 올린 태그)
#     --check : 사전 점검만 하고 아무것도 바꾸지 않는다
#
# 서버 목록은 저장소 밖 파일에서 읽는다 (기본 ~/.config/opennote/deploy-hosts,
# OPENNOTE_DEPLOY_HOSTS로 변경 가능). 한 줄에 한 역할:
#   <역할>  <user@host>  <ssh 키 경로>  <서버 배포 폴더>
#   api     ubuntu@203.0.113.10  ~/.ssh/opennote-api.key  /opt/opennote
#
# 서버 배포 폴더에는 .env(값·시크릿), docker-compose.override.yml(선택), 인증서만 둔다.
# docker-compose.yml과 promtail 설정은 배포할 버전의 것을 이 스크립트가 복사한다.
#
# Celery 워커는 자동 배포 대상이 아니다(개발 PC에서 수동). 단, 워커가 Django 모델을
# 직접 쓰므로 notes·notifications 모델/마이그레이션이 바뀐 버전이면 경고를 띄운다.
# =============================================================================
set -euo pipefail

REGISTRY=ghcr.io/yc7764
HOSTS_FILE=${OPENNOTE_DEPLOY_HOSTS:-$HOME/.config/opennote/deploy-hosts}
ORDER=(sttedit api gateway)
# 서버에 남기는 백업 개수 — 설정 백업에는 시크릿이 든 .env 사본이 들어 있어 무한히 쌓지 않는다
KEEP_DB_BACKUPS=5
KEEP_CONFIG_BACKUPS=10

declare -A ROLE_SERVICES=([api]="backend" [sttedit]="sttedit" [gateway]="frontend")
declare -A ROLE_FILES=(
  [api]="docker-compose.yml backend/python-django/deploy/promtail-config.yml"
  [sttedit]="docker-compose.yml backend/sttEdit/deploy/promtail-config.yml"
  [gateway]="docker-compose.yml"
)
declare -A ROLE_LOGDIRS=([api]="backend/python-django/logs" [sttedit]="backend/sttEdit/logs" [gateway]="")
# 다른 서버의 게이트웨이가 붙는 역할은 바인딩 주소를 .env에 반드시 명시하게 한다.
# (기본값 127.0.0.1이면 원격 게이트웨이가 접속하지 못한다)
declare -A ROLE_BIND_KEY=([api]="BACKEND_BIND" [sttedit]="STTEDIT_BIND" [gateway]="")

ROLE=deploy
log()  { printf '\033[1m[%s]\033[0m %s\n' "$ROLE" "$*"; }
warn() { printf '\033[33m[%s] 주의: %s\033[0m\n' "$ROLE" "$*"; }
die()  { printf '\033[31m[%s] 중단: %s\033[0m\n' "$ROLE" "$*" >&2; exit 1; }
confirm() { local a; read -r -p "$1 [y/N] " a; [[ "$a" == [yY] ]]; }

usage() { sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

# 태그 → 소스 리비전 (배포할 버전의 compose·promtail 설정을 꺼내는 데 쓴다)
tag_to_rev() {
  case "$1" in
    sha-*) echo "${1#sha-}" ;;
    v*)    echo "$1" ;;
    *)     return 1 ;;
  esac
}

env_keys() { grep -oE '^#?[A-Z_][A-Z0-9_]*=' | tr -d '#=' | sort -u; }

# 원격에서 스크립트 실행: 본문은 stdin, 인자는 $1.. 로 전달 (따옴표 지옥 방지)
remote_sh() { ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 "$TARGET" bash -s -- "$@"; }

# ---------------------------------------------------------------------------
[[ $# -ge 2 ]] || usage
TARGET_ROLE=$1; TAG=$2; CHECK_ONLY=false
[[ "${3:-}" == "--check" ]] && CHECK_ONLY=true

[[ "$TAG" =~ ^(sha-[0-9a-f]{7}|v[0-9]+(\.[0-9]+)*)$ ]] || die "태그 형식이 아닙니다: $TAG (sha-<7자리> 또는 v1.xxx)"
case "$TARGET_ROLE" in api|sttedit|gateway) ROLES=("$TARGET_ROLE") ;; all) ROLES=("${ORDER[@]}") ;; *) usage ;; esac
[[ -f "$HOSTS_FILE" ]] || die "서버 목록 파일이 없습니다: $HOSTS_FILE"
command -v docker >/dev/null || die "docker CLI가 필요합니다 (GHCR 이미지 확인용)"

cd "$(git rev-parse --show-toplevel)"
git fetch -q --tags origin || warn "git fetch 실패 — 로컬에 있는 커밋으로 진행합니다"
REV=$(tag_to_rev "$TAG")
git cat-file -e "$REV^{commit}" 2>/dev/null || die "$TAG 에 해당하는 커밋($REV)이 로컬 저장소에 없습니다"
TS=$(date +%Y%m%d-%H%M%S)

# ---------------------------------------------------------------------------
deploy_role() {
  ROLE=$1
  local line
  line=$(awk -v r="$ROLE" '$1 == r { print; exit }' "$HOSTS_FILE")
  [[ -n "$line" ]] || die "$HOSTS_FILE 에 $ROLE 항목이 없습니다"
  read -r _ TARGET KEY DIR <<<"$line"
  KEY=${KEY/#\~/$HOME}

  # 1) 이미지가 GHCR에 있는지
  local svc
  for svc in ${ROLE_SERVICES[$ROLE]}; do
    docker buildx imagetools inspect "$REGISTRY/opennote-$svc:$TAG" >/dev/null 2>&1 \
      || die "$REGISTRY/opennote-$svc:$TAG 이미지가 GHCR에 없습니다 (CI 완료 여부 확인)"
  done

  # 2) 서버 .env 점검 — 값은 읽지 않고 키와 역할 관련 값만 본다
  local info
  info=$(remote_sh "$DIR" <<'EOF'
cd "$1" 2>/dev/null || { echo "NODIR"; exit 0; }
[ -f .env ] || { echo "NOENV"; exit 0; }
echo "PROFILES=$(grep -E '^COMPOSE_PROFILES=' .env | tail -1 | cut -d= -f2-)"
echo "PREV=$(grep -E '^OPENNOTE_TAG=' .env | tail -1 | cut -d= -f2-)"
echo "KEYS=$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' .env | tr -d = | sort -u | tr '\n' ' ')"
EOF
)
  [[ "$info" != NODIR ]] || die "$TARGET 에 배포 폴더 $DIR 이 없습니다"
  [[ "$info" != NOENV ]] || die "$TARGET:$DIR/.env 가 없습니다"
  local profiles prev keys
  profiles=$(sed -n 's/^PROFILES=//p' <<<"$info")
  prev=$(sed -n 's/^PREV=//p' <<<"$info")
  keys=" $(sed -n 's/^KEYS=//p' <<<"$info") "

  [[ ",$profiles," == *",$ROLE,"* ]] || die "서버 .env의 COMPOSE_PROFILES($profiles)에 $ROLE 이 없습니다"
  local bind=${ROLE_BIND_KEY[$ROLE]}
  if [[ -n "$bind" && "$keys" != *" $bind "* ]]; then
    die "$bind 가 서버 .env에 명시돼 있지 않습니다. 게이트웨이가 다른 서버면 0.0.0.0, 같은 서버면 127.0.0.1로 적으세요"
  fi
  log "$TARGET  현재 ${prev:-(없음)} → 배포 $TAG"

  # 3) 이전 버전과 비교: 새로 생긴 .env 키, 워커 재배포 필요 여부
  local prev_rev=""
  prev_rev=$(tag_to_rev "$prev" 2>/dev/null) || true
  if [[ -n "$prev_rev" ]] && git cat-file -e "$prev_rev^{commit}" 2>/dev/null; then
    local new_keys
    new_keys=$(comm -13 <(git show "$prev_rev:.env.example" | env_keys) <(git show "$REV:.env.example" | env_keys) || true)
    if [[ -n "$new_keys" ]]; then
      warn "이번 버전에서 .env.example에 새로 생긴 키 — 이 서버 역할에 필요한지 확인하세요:"
      tr '\n' ' ' <<<"$new_keys"; echo
      $CHECK_ONLY || confirm "서버 .env 반영을 확인했습니까?" || die "사용자가 중단했습니다"
    fi
    if [[ "$ROLE" == api ]]; then
      local model_changes
      model_changes=$(git diff --name-only "$prev_rev" "$REV" -- \
        backend/python-django/apps/notes/models.py backend/python-django/apps/notes/migrations \
        backend/python-django/apps/notifications)
      if [[ -n "$model_changes" ]]; then
        warn "워커가 쓰는 모델이 바뀌었습니다 — Celery 워커도 같은 버전으로 수동 재배포하세요:"
        sed 's/^/    /' <<<"$model_changes"
      fi
    fi
  else
    warn "이전 태그(${prev:-없음})를 비교할 수 없어 .env 신규 키·모델 변경 점검을 건너뜁니다"
  fi

  if $CHECK_ONLY; then log "사전 점검 통과 (--check: 변경 없음)"; return; fi

  # 4) 백업 — 이번 배포 직전의 .env·compose·override
  remote_sh "$DIR" "$TS" "$KEEP_CONFIG_BACKUPS" <<'EOF'
set -e
cd "$1"; mkdir -p ".deploy-backups/$2"; chmod 700 .deploy-backups
for f in .env docker-compose.yml docker-compose.override.yml; do
  [ -f "$f" ] && cp -p "$f" ".deploy-backups/$2/"
done
# 최근 N회분만 남긴다 (폴더 이름이 시각이라 이름순 = 시간순)
ls -1d .deploy-backups/*/ | sort | head -n -"$3" | xargs -r rm -rf
true
EOF
  log "백업: $DIR/.deploy-backups/$TS/ (최근 ${KEEP_CONFIG_BACKUPS}회분 보관)"

  # 5) 배포할 버전의 compose·promtail 설정 복사, 로그 폴더 준비(컨테이너는 uid 1000)
  local f
  for f in ${ROLE_FILES[$ROLE]}; do
    git show "$REV:$f" | ssh -i "$KEY" -o BatchMode=yes "$TARGET" \
      "mkdir -p \"\$(dirname '$DIR/$f')\" && cat > '$DIR/$f'"
  done
  if [[ -n "${ROLE_LOGDIRS[$ROLE]}" ]]; then
    remote_sh "$DIR" "${ROLE_LOGDIRS[$ROLE]}" <<'EOF'
set -e
cd "$1"; mkdir -p "$2"
[ "$(stat -c %u "$2")" = 1000 ] || sudo -n chown 1000:1000 "$2"
EOF
  fi

  # 6) 새 이미지 받기 (.env의 태그는 아직 바꾸지 않는다 — 셸 변수로만 지정)
  remote_sh "$DIR" "$TAG" <<'EOF'
set -e
cd "$1"; OPENNOTE_TAG="$2" docker compose pull --quiet
EOF
  log "이미지 pull 완료"

  # 7) 마이그레이션 게이트 (api) — 없으면 진행, 있으면 백업 후 확인
  if [[ "$ROLE" == api ]]; then
    local plan
    plan=$(remote_sh "$DIR" "$TAG" <<'EOF'
cd "$1"; OPENNOTE_TAG="$2" docker compose run --rm --no-deps -T backend python manage.py migrate --plan 2>&1
EOF
) || die "마이그레이션 계획 조회 실패:
$plan"
    if grep -q 'No planned migration operations' <<<"$plan"; then
      log "적용할 마이그레이션 없음"
    else
      warn "적용할 마이그레이션이 있습니다:"
      sed 's/^/    /' <<<"$plan"
      log "DB 백업 중 (pg_dump)"
      remote_sh "$DIR" "$TAG" "$TS" "$KEEP_DB_BACKUPS" <<'EOF'
set -e
cd "$1"; mkdir -p backups; chmod 700 backups
DBIP=$(grep -E '^DB_SERVER_IP=' .env | tail -1 | cut -d= -f2-)
docker run --rm --env-file .env ${DBIP:+--add-host "db.opennote.internal:$DBIP"} \
  -v "$PWD/certs:/app/certs:ro" -v "$PWD/backups:/backups" postgres:16-alpine \
  sh -c 'conn="host=$DB_HOST port=${DB_PORT:-5432} dbname=$DB_NAME user=$DB_USER sslmode=${DB_SSL_MODE:-prefer}"
         [ -n "$DB_SSL_ROOT_CERT" ] && conn="$conn sslrootcert=$DB_SSL_ROOT_CERT"
         PGPASSWORD="$DB_PASSWORD" pg_dump -Fc -f "/backups/pre-'"$2"'-'"$3"'.dump" "$conn"'
ls -lh "backups/pre-$2-$3.dump"
# 최근 N개만 남긴다 (파일 이름의 시각 기준)
ls -1t backups/pre-*.dump | tail -n +"$(( $4 + 1 ))" | xargs -r rm -f
EOF
      confirm "위 마이그레이션을 운영 DB에 적용할까요?" \
        || die "마이그레이션을 적용하지 않았습니다. 서버의 실행 중 버전과 .env는 바뀌지 않았습니다"
      remote_sh "$DIR" "$TAG" <<'EOF'
set -e
cd "$1"; OPENNOTE_TAG="$2" docker compose run --rm --no-deps -T backend python manage.py migrate
EOF
      log "마이그레이션 적용 완료"
    fi
  fi

  # 8) .env 태그 교체 후 재기동
  remote_sh "$DIR" "$TAG" <<'EOF'
set -e
cd "$1"
if grep -qE '^OPENNOTE_TAG=' .env; then sed -i "s/^OPENNOTE_TAG=.*/OPENNOTE_TAG=$2/" .env
else echo "OPENNOTE_TAG=$2" >> .env; fi
docker compose up -d
EOF

  # 9) 헬스 대기 (최대 3분)
  if ! remote_sh "$DIR" <<'EOF'
cd "$1"
for _ in $(seq 1 36); do
  st=$(docker compose ps --format '{{.Service}} {{.State}} {{.Health}}')
  bad=$(echo "$st" | awk '$2 != "running" || ($3 != "" && $3 != "healthy")')
  if [ -n "$st" ] && [ -z "$bad" ]; then echo "$st"; exit 0; fi
  sleep 5
done
echo "$st"; echo "--- 최근 로그 ---"; docker compose logs --tail 40; exit 1
EOF
  then
    die "헬스체크 실패. 되돌리기: deploy/deploy.sh $ROLE ${prev:-<이전 태그>}  (마이그레이션은 되돌려지지 않음)"
  fi
  log "배포 완료 ✅  (되돌리기: deploy/deploy.sh $ROLE ${prev:-<이전 태그>})"
}

for r in "${ROLES[@]}"; do deploy_role "$r"; done
