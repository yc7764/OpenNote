#!/bin/sh
# =============================================================================
# Runtime Environment Variable Injection Script
# =============================================================================
# 이 스크립트는 컨테이너 시작 시 NEXT_PUBLIC_* 환경변수를
# JavaScript 파일로 생성하여 클라이언트에서 접근 가능하게 합니다.
#
# 장점:
# - 빌드 타임에 환경변수 하드코딩 불필요
# - 동일 이미지로 dev/staging/prod 환경 배포 가능
# - 환경변수 추가 시 .env 파일만 수정하면 됨

set -e

ENV_FILE="/app/public/__ENV.js"

echo "Generating runtime environment variables..."

# __ENV.js 파일 생성 시작
cat > "$ENV_FILE" << 'HEADER'
// Auto-generated at container startup - DO NOT EDIT
// Generated at:
HEADER

# 생성 시간 추가
echo "// $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$ENV_FILE"
echo "" >> "$ENV_FILE"
echo "window.__ENV = {" >> "$ENV_FILE"

# NEXT_PUBLIC_로 시작하는 모든 환경변수를 수집
env | grep "^NEXT_PUBLIC_" | sort | while IFS='=' read -r key value; do
  # 값에서 특수문자 이스케이프 (큰따옴표, 백슬래시)
  escaped_value=$(echo "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')
  echo "  \"$key\": \"$escaped_value\"," >> "$ENV_FILE"
done

echo "};" >> "$ENV_FILE"

# 파일 전문은 로그에 남기지 않는다 — NEXT_PUBLIC_ 접두사가 실수로 시크릿에 붙으면
# 브라우저와 컨테이너 로그 양쪽으로 동시 유출되는 구조가 되기 때문. 키 목록만 남긴다.
echo "Environment variables generated at $ENV_FILE:"
grep -o '"NEXT_PUBLIC_[A-Z_0-9]*"' "$ENV_FILE" | tr -d '"' || true

# Next.js 서버 시작
exec node server.js
