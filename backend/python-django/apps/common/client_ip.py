# apps/common/client_ip.py
"""
클라이언트 IP 판별 — 프로젝트 전역 단일 진입점

X-Forwarded-For는 클라이언트가 임의로 위조할 수 있는 일반 HTTP 헤더다.
게이트웨이(nginx)는 `$proxy_add_x_forwarded_for`로 클라이언트가 보낸 값을
지우지 않고 뒤에 실제 IP를 덧붙이므로, 맨 앞 값을 취하면 위조값을 그대로 믿게 된다.

반면 nginx는 X-Real-IP를 `$remote_addr`(TCP 실제 접속원)로 **덮어쓰므로**
클라이언트가 무엇을 보내든 무시된다. 따라서 X-Real-IP를 우선 신뢰하고,
X-Forwarded-For는 폴백으로만 쓰되 신뢰 프록시가 마지막에 append한
"가장 오른쪽" 값을 취해 위조된 앞쪽 값을 버린다.

sttEdit `websocket.server.ts`의 `getClientIp()`(MED-2)와 동일한 정책이다.

주의: 신뢰 프록시(nginx) 1단을 전제로 한다. Django 포트가 게이트웨이를 거치지
않고 외부에 직접 노출되면 헤더 기반 IP는 근본적으로 신뢰할 수 없으므로,
방화벽으로 직접 접근을 차단해야 한다. 프록시 단수가 바뀌면 이 모듈과
settings의 REST_FRAMEWORK['NUM_PROXIES']를 함께 조정해야 한다.

레이트리밋과 보안 로그가 이 함수의 반환값에 의존한다. 로깅 편의를 위해
동작을 바꾸지 말 것.
"""

from typing import Optional


def get_client_ip(request) -> Optional[str]:
    """요청의 실제 클라이언트 IP를 반환한다. 판별 불가 시 None."""
    meta = getattr(request, 'META', None)
    if not meta:
        return None

    # 1) X-Real-IP — nginx가 $remote_addr로 덮어쓰므로 위조 불가
    real_ip = meta.get('HTTP_X_REAL_IP')
    if real_ip and real_ip.strip():
        return real_ip.strip()

    # 2) X-Forwarded-For 폴백 — 마지막 hop이 신뢰 프록시가 붙인 값
    forwarded_for = meta.get('HTTP_X_FORWARDED_FOR')
    if forwarded_for:
        addrs = [addr.strip() for addr in forwarded_for.split(',') if addr.strip()]
        if addrs:
            return addrs[-1]

    # 3) 프록시를 거치지 않은 직접 연결
    return meta.get('REMOTE_ADDR')
