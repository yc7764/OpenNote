#!/usr/bin/env bash
# 호스트 NVIDIA 드라이버가 지원하는 최대 CUDA 버전을 감지해 출력한다.
#
# 왜 필요한가
#   Docker 빌드는 GPU에 접근할 수 없으므로 호스트에서 계산해 --build-arg로 넘겨야 한다.
#   고정값(예: 12.8)을 쓰면 GPU·드라이버가 바뀔 때 다시 어긋난다.
#   실제로 드라이버는 CUDA 12.9까지 지원하는데 이미지에 cu130 torch가 들어가
#   "NVIDIA driver is too old"로 STT가 전면 실패한 적이 있다 (2026-07-31).
#
# 사용법
#   CUDA_VERSION=$(./detect-cuda.sh) docker compose --profile gpu build
#   또는
#   ./detect-cuda.sh --export >> .env
#
# 출력
#   감지 성공 시: 12.9 처럼 major.minor
#   감지 실패 시: 아무것도 출력하지 않고 exit 1 (호출 측이 기본값을 쓰도록)

set -uo pipefail

FALLBACK="12.8"   # 감지 실패 시 호출 측이 참고할 보수적 기본값

detect() {
    command -v nvidia-smi >/dev/null 2>&1 || return 1
    # nvidia-smi 헤더의 "CUDA Version: 12.9" — 드라이버가 지원하는 최대 버전
    nvidia-smi 2>/dev/null | grep -oE 'CUDA Version: [0-9]+\.[0-9]+' | head -1 | awk '{print $3}'
}

CUDA="$(detect)"

if [ -z "${CUDA}" ]; then
    echo "detect-cuda: nvidia-smi로 CUDA 버전을 감지하지 못했습니다." >&2
    echo "detect-cuda: GPU가 없거나 드라이버가 설치되지 않은 환경일 수 있습니다." >&2
    echo "detect-cuda: 기본값 ${FALLBACK}을(를) 쓰려면 CUDA_VERSION=${FALLBACK}로 직접 지정하세요." >&2
    exit 1
fi

if [ "${1:-}" = "--export" ]; then
    echo "CUDA_VERSION=${CUDA}"
else
    echo "${CUDA}"
fi
