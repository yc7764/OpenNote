"""
common 앱 테스트

클라이언트 IP 판별 보안 테스트 (X-Forwarded-For 위조 방어 검증)
"""
import ssl

from django.test import RequestFactory, SimpleTestCase
from rest_framework.settings import api_settings

from apps.common.client_ip import get_client_ip


class GetClientIpTest(SimpleTestCase):
    """
    X-Forwarded-For는 클라이언트가 위조 가능하므로, nginx가 $remote_addr로
    덮어쓰는 X-Real-IP를 우선 신뢰해야 한다.
    """

    def setUp(self):
        self.factory = RequestFactory()

    def _request(self, **headers):
        # RequestFactory의 REMOTE_ADDR 기본값은 127.0.0.1
        return self.factory.get('/', **headers)

    def test_x_real_ip_우선_신뢰(self):
        """nginx가 덮어쓰는 X-Real-IP가 있으면 그 값을 쓴다."""
        request = self._request(HTTP_X_REAL_IP='203.0.113.50')
        self.assertEqual(get_client_ip(request), '203.0.113.50')

    def test_위조된_xff보다_x_real_ip가_이긴다(self):
        """공격자가 XFF를 위조해도 X-Real-IP가 있으면 무시된다."""
        request = self._request(
            HTTP_X_REAL_IP='203.0.113.50',
            HTTP_X_FORWARDED_FOR='1.1.1.1, 203.0.113.50',
        )
        self.assertEqual(get_client_ip(request), '203.0.113.50')

    def test_xff_위조값_무시하고_마지막_hop_사용(self):
        """
        X-Real-IP가 없는 폴백 경로. nginx는 $proxy_add_x_forwarded_for로
        실제 IP를 뒤에 덧붙이므로 마지막 값이 진짜다.
        """
        request = self._request(HTTP_X_FORWARDED_FOR='1.1.1.1, 203.0.113.50')
        self.assertEqual(get_client_ip(request), '203.0.113.50')

    def test_xff_다중_위조값_무시(self):
        """공격자가 여러 개를 넣어도 마지막 값만 쓴다."""
        request = self._request(
            HTTP_X_FORWARDED_FOR='1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.50'
        )
        self.assertEqual(get_client_ip(request), '203.0.113.50')

    def test_xff_단독일_때도_동작(self):
        """클라이언트가 XFF를 안 보내면 nginx가 붙인 값 하나만 남는다."""
        request = self._request(HTTP_X_FORWARDED_FOR='203.0.113.50')
        self.assertEqual(get_client_ip(request), '203.0.113.50')

    def test_공백_처리(self):
        """헤더 값의 공백을 제거한다."""
        request = self._request(HTTP_X_FORWARDED_FOR='1.1.1.1 ,  203.0.113.50  ')
        self.assertEqual(get_client_ip(request), '203.0.113.50')

    def test_빈_x_real_ip는_폴백(self):
        """X-Real-IP가 빈 문자열이면 XFF로 넘어간다."""
        request = self._request(
            HTTP_X_REAL_IP='   ',
            HTTP_X_FORWARDED_FOR='1.1.1.1, 203.0.113.50',
        )
        self.assertEqual(get_client_ip(request), '203.0.113.50')

    def test_빈_xff는_remote_addr_폴백(self):
        """XFF가 쉼표뿐이면 REMOTE_ADDR로 넘어간다."""
        request = self._request(HTTP_X_FORWARDED_FOR=' , , ')
        self.assertEqual(get_client_ip(request), '127.0.0.1')

    def test_프록시_헤더_없으면_remote_addr(self):
        """프록시를 거치지 않은 직접 연결."""
        request = self._request()
        self.assertEqual(get_client_ip(request), '127.0.0.1')

    def test_request가_None이면_None(self):
        """예외 핸들러 등 request가 없을 수 있는 경로 보호."""
        self.assertIsNone(get_client_ip(None))

    def test_META가_없는_객체도_None(self):
        self.assertIsNone(get_client_ip(object()))

    def test_위조_시도마다_같은_IP로_수렴(self):
        """
        레이트리밋의 핵심 요건: 공격자가 헤더를 매번 바꿔도
        동일한 식별자가 나와야 제한이 누적된다.
        """
        forged = ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4']
        results = {
            get_client_ip(
                self._request(HTTP_X_FORWARDED_FOR=f'{f}, 203.0.113.50')
            )
            for f in forged
        }
        self.assertEqual(results, {'203.0.113.50'})


class DrfNumProxiesSettingTest(SimpleTestCase):
    """
    DRF AnonRateThrottle은 자체적으로 get_ident()를 쓴다.
    NUM_PROXIES가 None이면 XFF 문자열 전체를 캐시 키로 삼아,
    앞부분만 바꿔도 매번 새 키가 되어 스로틀이 발동하지 않는다.
    """

    def test_num_proxies가_설정되어_있다(self):
        self.assertEqual(api_settings.NUM_PROXIES, 1)

    def test_drf_get_ident도_위조값을_무시한다(self):
        from rest_framework.throttling import BaseThrottle

        factory = RequestFactory()
        throttle = BaseThrottle()

        idents = {
            throttle.get_ident(
                factory.get('/', HTTP_X_FORWARDED_FOR=f'{forged}, 203.0.113.50')
            )
            for forged in ['1.1.1.1', '2.2.2.2', '3.3.3.3']
        }
        self.assertEqual(idents, {'203.0.113.50'})


class AllauthTrustedProxyTest(SimpleTestCase):
    """
    allauth는 자체 IP 레이트리밋(login 30/m/ip, signup 20/m/ip 등)에
    어댑터의 get_client_ip()를 쓴다. 65.14.2 미만은 XFF 맨 앞 값을 신뢰했고,
    이후 버전도 ALLAUTH_TRUSTED_PROXY_COUNT를 지정하지 않으면 XFF를 완전히 무시해
    모든 사용자가 nginx IP 하나로 묶인다(= 전체 공유 버킷).
    """

    def setUp(self):
        self.factory = RequestFactory()

    def test_trusted_proxy_count가_설정되어_있다(self):
        from allauth.core.internal import httpkit  # noqa: F401
        from django.conf import settings

        self.assertEqual(getattr(settings, 'ALLAUTH_TRUSTED_PROXY_COUNT', 0), 1)

    def test_allauth_어댑터가_위조값을_무시한다(self):
        from allauth.account.adapter import get_adapter

        adapter = get_adapter()
        ips = {
            adapter.get_client_ip(
                self.factory.get(
                    '/', HTTP_X_FORWARDED_FOR=f'{forged}, 203.0.113.50'
                )
            )
            for forged in ['1.1.1.1', '2.2.2.2', '3.3.3.3']
        }
        self.assertEqual(ips, {'203.0.113.50'})

    def test_allauth_프록시_헤더_없으면_remote_addr(self):
        """nginx를 거치지 않는 경로에서도 예외 없이 동작해야 한다."""
        from allauth.account.adapter import get_adapter

        self.assertEqual(
            get_adapter().get_client_ip(self.factory.get('/')), '127.0.0.1'
        )


class DatabaseTlsSettingTest(SimpleTestCase):
    """
    DB 접속의 TLS 설정 검증.

    sslmode=require는 암호화만 하고 서버 인증서를 검증하지 않아 중간자 공격에
    무방비다. verify-full일 때는 sslrootcert가 반드시 함께 있어야 한다.
    """

    def test_verify_모드면_sslrootcert가_함께_설정된다(self):
        from django.conf import settings

        db = settings.DATABASES['default']
        if db['ENGINE'] != 'django.db.backends.postgresql':
            self.skipTest('PostgreSQL 설정이 아님')

        options = db.get('OPTIONS', {})
        sslmode = options.get('sslmode', 'disable')
        if not sslmode.startswith('verify'):
            self.skipTest(f'verify 모드 아님 (현재: {sslmode})')

        self.assertTrue(
            options.get('sslrootcert'),
            'verify-* 모드인데 sslrootcert가 없다 — 검증이 불가능하다',
        )


class StorageTlsSettingTest(SimpleTestCase):
    """
    MinIO 접속의 TLS 검증 설정.

    boto3의 verify는 boolean 또는 CA 번들 경로를 받는다. 사설 CA 발급 인증서는
    시스템 신뢰 저장소에 없으므로 True로 두면 검증에 실패한다.
    """

    def test_https_엔드포인트면_CA_경로가_지정된다(self):
        from django.conf import settings

        if not getattr(settings, 'USE_S3', False):
            self.skipTest('S3 스토리지 미사용')
        endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', '') or ''
        if not endpoint.startswith('https://'):
            self.skipTest(f'HTTPS 엔드포인트 아님 ({endpoint})')

        verify = getattr(settings, 'AWS_S3_VERIFY', True)
        self.assertNotIsInstance(
            verify, bool,
            'HTTPS인데 AWS_S3_VERIFY가 boolean이다 — 사설 CA 경로를 지정해야 한다',
        )


class CeleryBrokerTlsSettingTest(SimpleTestCase):
    """amqps:// 사용 시 인증서 검증이 켜져 있어야 한다."""

    def test_amqps면_CERT_REQUIRED로_검증한다(self):
        from django.conf import settings

        broker = getattr(settings, 'CELERY_BROKER_URL', '') or ''
        if not broker.startswith('amqps://'):
            self.skipTest('평문 amqp:// 사용 중')

        opts = getattr(settings, 'CELERY_BROKER_USE_SSL', None)
        self.assertIsNotNone(opts, 'amqps인데 BROKER_USE_SSL이 없다')
        self.assertEqual(opts.get('cert_reqs'), ssl.CERT_REQUIRED)
        self.assertTrue(opts.get('ca_certs'), '검증에 쓸 CA 경로가 없다')


class S3ClientTlsTest(SimpleTestCase):
    """
    django-storages는 settings.AWS_S3_VERIFY를 자동으로 쓰지만,
    직접 만든 boto3 클라이언트에는 명시적으로 전달해야 한다.
    전달을 빠뜨리면 사설 CA로 발급한 MinIO 인증서 검증에 실패해
    오디오 재생(/api/notes/{id}/play/)이 500으로 떨어진다. (2026-07-31 실제 발생)
    """

    def test_s3_client이_CA_설정을_전달한다(self):
        import inspect
        from apps.notes import s3_client

        src = inspect.getsource(s3_client.get_s3_client)
        self.assertIn(
            'verify=', src,
            'boto3.client()에 verify가 없다 — 사설 CA 검증이 불가능하다',
        )
        self.assertIn(
            'AWS_S3_VERIFY', src,
            'verify에 settings.AWS_S3_VERIFY를 넘겨야 한다',
        )


class MetricsAccessTest(SimpleTestCase):
    """
    /metrics는 내부 구조를 노출하므로 IP 화이트리스트를 통과해야만 열린다.
    화이트리스트 판정은 프록시 헤더가 아니라 REMOTE_ADDR만 본다(스푸핑 방지).
    """

    def setUp(self):
        self.factory = RequestFactory()

    def _get(self, remote_addr, **headers):
        from apps.common.metrics import metrics_view
        request = self.factory.get('/metrics', REMOTE_ADDR=remote_addr, **headers)
        return metrics_view(request)

    def test_루프백은_허용(self):
        self.assertEqual(self._get('127.0.0.1').status_code, 200)

    def test_외부_IP는_403(self):
        self.assertEqual(self._get('203.0.113.50').status_code, 403)

    def test_프록시_헤더로_화이트리스트를_우회할_수_없다(self):
        """X-Real-IP·X-Forwarded-For에 127.0.0.1을 넣어도 REMOTE_ADDR이 기준이다."""
        response = self._get(
            '203.0.113.50',
            HTTP_X_REAL_IP='127.0.0.1',
            HTTP_X_FORWARDED_FOR='127.0.0.1',
        )
        self.assertEqual(response.status_code, 403)

    def test_IPv4_매핑_IPv6도_허용(self):
        """::ffff:127.0.0.1 형태로 들어와도 루프백으로 인정한다."""
        self.assertEqual(self._get('::ffff:127.0.0.1').status_code, 200)

    def test_판별불가_주소는_거부(self):
        self.assertEqual(self._get('not-an-ip').status_code, 403)

    def test_CIDR_허용범위(self):
        """METRICS_ALLOWED_IPS에 CIDR을 주면 대역 전체가 열린다."""
        from apps.common import metrics
        original = metrics._ALLOWED_NETWORKS
        metrics._ALLOWED_NETWORKS = metrics._parse_allowed('10.0.0.0/8')
        try:
            self.assertEqual(self._get('10.1.2.3').status_code, 200)
            self.assertEqual(self._get('11.1.2.3').status_code, 403)
        finally:
            metrics._ALLOWED_NETWORKS = original
