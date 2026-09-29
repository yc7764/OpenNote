# apps/common/metrics.py
"""
Prometheus 메트릭 엔드포인트 접근 제어

`/metrics`는 요청 경로·응답코드·DB 쿼리 통계 등 내부 구조를 그대로 노출한다.
운영에서는 호스트 방화벽이 스크레이퍼만 통과시키지만, 저장소를 그대로 받아
띄우는 셀프호스터에게는 그 방화벽이 없으므로 앱 레벨에서도 막는다.

sttEdit `monitoring/guards/metrics-ip.guard.ts`와 동일한 정책이다:
- **프록시 헤더(X-Real-IP·X-Forwarded-For)를 신뢰하지 않는다.**
  헤더는 클라이언트가 위조할 수 있고, 여기서 위조를 허용하면 화이트리스트가
  그대로 무력화된다. 따라서 `apps.common.client_ip.get_client_ip`(레이트리밋용,
  프록시 헤더 우선)를 쓰지 않고 TCP 접속원인 REMOTE_ADDR만 본다.
- 즉 스크레이퍼가 nginx를 거쳐 들어오면 REMOTE_ADDR은 nginx IP가 된다.
  그 경우 nginx(또는 도커 브리지 게이트웨이) IP를 METRICS_ALLOWED_IPS에 넣어야 한다.

환경변수:
- METRICS_ALLOWED_IPS: 쉼표 구분 IP/CIDR 목록 (기본 `127.0.0.1,::1`)
- METRICS_ENABLED: false면 엔드포인트 자체를 404로 감춘다 (기본 true)
"""

import ipaddress
import logging

from django.conf import settings
from django.http import Http404, HttpResponseForbidden
from django_prometheus import exports

logger = logging.getLogger(__name__)


def _parse_allowed(raw):
    """쉼표 구분 IP/CIDR 문자열을 ip_network 목록으로 파싱한다."""
    networks = []
    for entry in (raw or '').split(','):
        entry = entry.strip()
        if not entry:
            continue
        try:
            # strict=False: '10.0.0.5/24'처럼 호스트비트가 있어도 허용
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            logger.warning('METRICS_ALLOWED_IPS 항목을 해석할 수 없어 무시합니다: %r', entry)
    return networks


_ALLOWED_NETWORKS = _parse_allowed(getattr(settings, 'METRICS_ALLOWED_IPS', ''))


def _normalize(addr):
    """IPv4-mapped IPv6(::ffff:127.0.0.1)를 IPv4로 낮춰 비교 가능하게 만든다."""
    try:
        parsed = ipaddress.ip_address(addr)
    except ValueError:
        return None
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped:
        return parsed.ipv4_mapped
    return parsed


def is_allowed(remote_addr) -> bool:
    if not remote_addr:
        return False
    parsed = _normalize(str(remote_addr).strip())
    if parsed is None:
        return False
    return any(parsed in network for network in _ALLOWED_NETWORKS)


def metrics_view(request, *args, **kwargs):
    """IP 화이트리스트를 통과한 요청만 django_prometheus 익스포터로 넘긴다."""
    if not getattr(settings, 'METRICS_ENABLED', True):
        raise Http404

    remote_addr = request.META.get('REMOTE_ADDR')
    if not is_allowed(remote_addr):
        logger.warning('허용되지 않은 출발지에서 /metrics 접근 시도: %s', remote_addr)
        return HttpResponseForbidden('Forbidden')

    return exports.ExportToDjangoView(request, *args, **kwargs)
