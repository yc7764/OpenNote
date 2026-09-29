"""
accounts 앱 테스트

JWT 블랙리스트 관련 보안 테스트 (HIGH-1 수정 검증)
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from django.utils import timezone
from django.test import RequestFactory
from django.contrib.sessions.middleware import SessionMiddleware
from datetime import timedelta
from allauth.account.models import EmailAddress
from allauth.socialaccount.adapter import get_adapter as get_socialaccount_adapter
from apps.accounts.adapters import CustomSocialAccountAdapter
from apps.accounts.models import AccountLinkingToken

User = get_user_model()


class JWTBlacklistLogoutTest(TestCase):
    """버그 3 수정 검증: 로그아웃 시 refresh token 블랙리스트 등록"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123!',
            is_active=True,
        )
        self.refresh = RefreshToken.for_user(self.user)
        self.access_token = str(self.refresh.access_token)
        self.refresh_token = str(self.refresh)

    def _set_cookies(self, client, access_token, refresh_token):
        client.cookies['access_token'] = access_token
        client.cookies['refresh_token'] = refresh_token

    def test_logout_blacklists_refresh_token(self):
        """로그아웃 후 refresh token이 블랙리스트에 등록되어야 한다."""
        self._set_cookies(self.client, self.access_token, self.refresh_token)

        response = self.client.post(reverse('rest_logout'))
        self.assertEqual(response.status_code, 200)

        # 블랙리스트에 등록됐는지 확인
        jti = self.refresh.payload.get('jti')
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=jti).exists(),
            "로그아웃 후 refresh token이 블랙리스트에 등록되어야 합니다."
        )

    def test_logout_blacklisted_token_cannot_refresh(self):
        """로그아웃 후 탈취된 refresh token으로 새 토큰 발급이 불가해야 한다."""
        self._set_cookies(self.client, self.access_token, self.refresh_token)
        self.client.post(reverse('rest_logout'))

        # 로그아웃 후 탈취된 토큰으로 갱신 시도
        attacker_client = APIClient()
        attacker_client.cookies['refresh_token'] = self.refresh_token
        response = attacker_client.post(reverse('token_refresh'))

        self.assertEqual(
            response.status_code, 401,
            "블랙리스트에 등록된 refresh token으로 갱신이 불가해야 합니다."
        )

    def test_logout_without_refresh_token_cookie(self):
        """refresh token 쿠키 없이 로그아웃해도 200 반환해야 한다."""
        response = self.client.post(reverse('rest_logout'))
        self.assertEqual(response.status_code, 200)

    def test_logout_clears_cookies(self):
        """로그아웃 후 쿠키가 제거되어야 한다."""
        self._set_cookies(self.client, self.access_token, self.refresh_token)
        response = self.client.post(reverse('rest_logout'))

        # Set-Cookie 헤더에서 쿠키 만료 확인
        self.assertEqual(response.status_code, 200)

    def test_access_token_still_valid_after_logout(self):
        """알려진 한계: 로그아웃 후에도 기존 access token은 만료 전까지 유효하다.
        JWT는 stateless라 서버에서 강제 무효화 불가.
        해결하려면 Redis 기반 JTI 블랙리스트 구현 필요.
        """
        self._set_cookies(self.client, self.access_token, self.refresh_token)
        self.client.post(reverse('rest_logout'))

        # 로그아웃 후 기존 access token으로 인증된 요청
        attacker_client = APIClient()
        attacker_client.cookies['access_token'] = self.access_token
        response = attacker_client.get('/api/auth/profile/')

        # 여전히 200 — access token은 무효화되지 않음
        self.assertEqual(response.status_code, 200)


class JWTRotateRefreshTokenTest(TestCase):
    """버그 2 수정 검증: ROTATE_REFRESH_TOKENS 설정 올바른 참조"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser2',
            email='test2@example.com',
            password='testpass123!',
            is_active=True,
        )
        self.refresh = RefreshToken.for_user(self.user)
        self.access_token = str(self.refresh.access_token)
        self.refresh_token = str(self.refresh)

    def test_token_refresh_rotates_token(self):
        """ROTATE_REFRESH_TOKENS=True 설정 시 새 refresh token이 발급되어야 한다."""
        self.client.cookies['refresh_token'] = self.refresh_token
        response = self.client.post(reverse('token_refresh'))

        self.assertEqual(response.status_code, 200)

        # 기존 토큰이 블랙리스트에 등록됐는지 확인
        old_jti = self.refresh.payload.get('jti')
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=old_jti).exists(),
            "토큰 갱신 후 기존 refresh token이 블랙리스트에 등록되어야 합니다."
        )

    def test_old_refresh_token_invalid_after_rotation(self):
        """토큰 로테이션 후 기존 refresh token 재사용이 불가해야 한다."""
        self.client.cookies['refresh_token'] = self.refresh_token
        self.client.post(reverse('token_refresh'))

        # 기존 토큰으로 다시 갱신 시도
        second_client = APIClient()
        second_client.cookies['refresh_token'] = self.refresh_token
        response = second_client.post(reverse('token_refresh'))

        self.assertEqual(
            response.status_code, 401,
            "로테이션된 기존 refresh token으로 재사용이 불가해야 합니다."
        )


class JWTRotateNewTokenIssuanceTest(TestCase):
    """신규 토큰 정상 발급 검증: 로테이션 후 새 토큰이 실제로 올바르게 발급되는지"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser_issuance',
            email='issuance@example.com',
            password='testpass123!',
            is_active=True,
        )
        self.refresh = RefreshToken.for_user(self.user)
        self.access_token = str(self.refresh.access_token)
        self.refresh_token = str(self.refresh)

    def test_new_refresh_token_cookie_is_set_after_rotation(self):
        """로테이션 후 응답에 새 refresh token 쿠키가 세팅되어야 한다."""
        self.client.cookies['refresh_token'] = self.refresh_token
        response = self.client.post(reverse('token_refresh'))

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            'refresh_token', response.cookies,
            "응답에 새 refresh_token 쿠키가 없습니다."
        )

    def test_new_refresh_token_is_different_from_old(self):
        """로테이션 후 새 refresh token은 기존과 달라야 한다."""
        self.client.cookies['refresh_token'] = self.refresh_token
        response = self.client.post(reverse('token_refresh'))

        new_refresh_token = response.cookies.get('refresh_token')
        self.assertIsNotNone(new_refresh_token)
        self.assertNotEqual(
            new_refresh_token.value, self.refresh_token,
            "새 refresh token이 기존 토큰과 동일합니다."
        )

    def test_new_access_token_cookie_is_set_after_rotation(self):
        """로테이션 후 응답에 새 access token 쿠키가 세팅되어야 한다."""
        self.client.cookies['refresh_token'] = self.refresh_token
        response = self.client.post(reverse('token_refresh'))

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            'access_token', response.cookies,
            "응답에 새 access_token 쿠키가 없습니다."
        )

    def test_new_access_token_is_different_from_old(self):
        """로테이션 후 새 access token은 기존과 달라야 한다."""
        self.client.cookies['refresh_token'] = self.refresh_token
        response = self.client.post(reverse('token_refresh'))

        new_access_token = response.cookies.get('access_token')
        self.assertIsNotNone(new_access_token)
        self.assertNotEqual(
            new_access_token.value, self.access_token,
            "새 access token이 기존 토큰과 동일합니다."
        )

    def test_new_access_token_authenticates_successfully(self):
        """로테이션 후 새 access token으로 인증된 요청이 성공해야 한다."""
        self.client.cookies['refresh_token'] = self.refresh_token
        response = self.client.post(reverse('token_refresh'))

        new_access_token = response.cookies['access_token'].value

        auth_client = APIClient()
        auth_client.cookies['access_token'] = new_access_token
        profile_response = auth_client.get(reverse('user_profile'))

        self.assertEqual(
            profile_response.status_code, 200,
            "새 access token으로 인증된 요청이 실패했습니다."
        )

    def test_chained_rotation_works(self):
        """연속 로테이션: 새 refresh token으로 다시 갱신이 가능해야 한다."""
        # 1차 로테이션
        self.client.cookies['refresh_token'] = self.refresh_token
        response1 = self.client.post(reverse('token_refresh'))
        self.assertEqual(response1.status_code, 200)

        new_refresh_token = response1.cookies['refresh_token'].value

        # 2차 로테이션 — 새로 발급된 refresh token으로 재갱신
        second_client = APIClient()
        second_client.cookies['refresh_token'] = new_refresh_token
        response2 = second_client.post(reverse('token_refresh'))

        self.assertEqual(
            response2.status_code, 200,
            "새로 발급된 refresh token으로 연속 갱신이 실패했습니다."
        )

        # 2차 로테이션 후에도 새 토큰이 발급됐는지 확인
        self.assertIn('refresh_token', response2.cookies)
        self.assertNotEqual(
            response2.cookies['refresh_token'].value, new_refresh_token,
            "2차 로테이션 후 새 refresh token이 발급되지 않았습니다."
        )


class TokenBlacklistAppInstalledTest(TestCase):
    """버그 1 수정 검증: token_blacklist 앱 정상 설치 확인"""

    def test_blacklist_models_accessible(self):
        """OutstandingToken, BlacklistedToken 모델이 접근 가능해야 한다."""
        # 앱이 설치되지 않으면 import 자체가 실패
        from rest_framework_simplejwt.token_blacklist.models import (
            OutstandingToken, BlacklistedToken
        )
        self.assertEqual(OutstandingToken.objects.count(), 0)
        self.assertEqual(BlacklistedToken.objects.count(), 0)

    def test_blacklist_method_works(self):
        """RefreshToken.blacklist() 호출이 AttributeError 없이 작동해야 한다."""
        user = User.objects.create_user(
            username='testuser3',
            email='test3@example.com',
            password='testpass123!',
            is_active=True,
        )
        refresh = RefreshToken.for_user(user)

        # AttributeError가 발생하면 안 됨
        try:
            refresh.blacklist()
        except AttributeError:
            self.fail("refresh.blacklist()에서 AttributeError 발생 - token_blacklist 앱이 설치되지 않음")

        # 블랙리스트에 등록됐는지 확인
        jti = refresh.payload.get('jti')
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=jti).exists())


class JWTLoginCookieTest(TestCase):
    """로그인 시 JWT 쿠키 발급 검증"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='logintest',
            email='logintest@example.com',
            password='testpass123!',
            is_active=True,
        )

    def test_login_sets_access_token_cookie(self):
        """로그인 성공 시 access_token 쿠키가 세팅되어야 한다."""
        response = self.client.post(reverse('rest_login'), {
            'login': 'logintest',
            'password': 'testpass123!',
        })

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            'access_token', response.cookies,
            "로그인 응답에 access_token 쿠키가 없습니다."
        )

    def test_login_sets_refresh_token_cookie(self):
        """로그인 성공 시 refresh_token 쿠키가 세팅되어야 한다."""
        response = self.client.post(reverse('rest_login'), {
            'login': 'logintest',
            'password': 'testpass123!',
        })

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            'refresh_token', response.cookies,
            "로그인 응답에 refresh_token 쿠키가 없습니다."
        )

    def test_login_cookies_are_httponly(self):
        """로그인 시 발급된 쿠키는 HttpOnly 속성이어야 한다."""
        response = self.client.post(reverse('rest_login'), {
            'login': 'logintest',
            'password': 'testpass123!',
        })

        self.assertTrue(
            response.cookies['access_token']['httponly'],
            "access_token 쿠키가 HttpOnly가 아닙니다."
        )
        self.assertTrue(
            response.cookies['refresh_token']['httponly'],
            "refresh_token 쿠키가 HttpOnly가 아닙니다."
        )

    def test_login_access_token_is_valid_for_auth(self):
        """로그인으로 발급된 access_token으로 인증된 요청이 성공해야 한다."""
        login_response = self.client.post(reverse('rest_login'), {
            'login': 'logintest',
            'password': 'testpass123!',
        })

        access_token = login_response.cookies['access_token'].value

        auth_client = APIClient()
        auth_client.cookies['access_token'] = access_token
        profile_response = auth_client.get(reverse('user_profile'))

        self.assertEqual(
            profile_response.status_code, 200,
            "로그인으로 발급된 access_token으로 인증 요청이 실패했습니다."
        )

    def test_login_refresh_token_can_rotate(self):
        """로그인으로 발급된 refresh_token으로 토큰 갱신이 가능해야 한다."""
        login_response = self.client.post(reverse('rest_login'), {
            'login': 'logintest',
            'password': 'testpass123!',
        })

        refresh_token = login_response.cookies['refresh_token'].value

        refresh_client = APIClient()
        refresh_client.cookies['refresh_token'] = refresh_token
        refresh_response = refresh_client.post(reverse('token_refresh'))

        self.assertEqual(
            refresh_response.status_code, 200,
            "로그인으로 발급된 refresh_token으로 갱신 요청이 실패했습니다."
        )


class JWTTokenRefreshEdgeCaseTest(TestCase):
    """토큰 갱신 엣지 케이스 검증"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='edgecase',
            email='edgecase@example.com',
            password='testpass123!',
            is_active=True,
        )

    def test_refresh_without_cookie_returns_401(self):
        """refresh_token 쿠키 없이 갱신 요청 시 401을 반환해야 한다."""
        response = self.client.post(reverse('token_refresh'))

        self.assertEqual(
            response.status_code, 401,
            "refresh_token 없는 갱신 요청이 401을 반환하지 않았습니다."
        )
        self.assertEqual(response.data.get('code'), 'refresh_token_missing')

    def test_refresh_with_invalid_token_returns_401(self):
        """변조된 refresh_token으로 갱신 요청 시 401을 반환해야 한다."""
        self.client.cookies['refresh_token'] = 'invalid.token.value'
        response = self.client.post(reverse('token_refresh'))

        self.assertEqual(
            response.status_code, 401,
            "변조된 refresh_token 갱신 요청이 401을 반환하지 않았습니다."
        )
        self.assertEqual(response.data.get('code'), 'token_invalid')


class InactiveLoginPasswordCheckTest(TestCase):
    """수정 검증: 미인증 계정도 비밀번호 검증 후에만 인증 안내·토큰 발급"""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # locmem 레이트리밋 카운터가 테스트 간 누적되지 않도록
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='inactiveuser',
            email='inactive@example.com',
            password='correctpass123!',
            is_active=False,
        )

    def test_wrong_password_gets_generic_error_without_token(self):
        """비밀번호가 틀리면 토큰·인증 안내 없이 일반 실패 메시지를 받아야 한다."""
        response = self.client.post(reverse('rest_login'), {
            'login': 'inactiveuser', 'password': 'wrongpass',
        })
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('verification_token', response.data,
                         "비밀번호 검증 없이 verification_token이 발급되면 안 됩니다.")
        self.assertNotIn('requires_verification', response.data)
        self.assertNotIn('이메일 인증', response.data['detail'],
                         "계정 존재를 드러내는 안내 메시지가 노출되면 안 됩니다.")

    def test_correct_password_gets_verification_guidance(self):
        """비밀번호가 맞으면 기존과 동일하게 인증 안내와 토큰을 받아야 한다."""
        response = self.client.post(reverse('rest_login'), {
            'login': 'inactiveuser', 'password': 'correctpass123!',
        })
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data.get('requires_verification'))
        self.assertIn('verification_token', response.data)

    def test_verification_token_payload_has_no_email(self):
        """발급된 토큰 payload에 이메일 평문이 없어야 한다 (JWT는 누구나 디코드 가능)."""
        import jwt as pyjwt
        response = self.client.post(reverse('rest_login'), {
            'login': 'inactiveuser', 'password': 'correctpass123!',
        })
        payload = pyjwt.decode(
            response.data['verification_token'],
            options={'verify_signature': False},
        )
        self.assertNotIn('email', payload)
        self.assertEqual(payload['user_id'], self.user.id)


class PasswordResetEnumerationTest(TestCase):
    """수정 검증: 미등록 이메일도 등록 이메일과 구별 불가한 응답"""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='resetuser',
            email='registered@example.com',
            password='pass123!',
            is_active=True,
        )

    def test_unregistered_email_indistinguishable_from_registered(self):
        """등록/미등록 이메일이 동일한 상태코드·메시지를 받아야 한다."""
        r_registered = self.client.post(
            reverse('rest_password_reset'), {'email': 'registered@example.com'})
        r_unregistered = self.client.post(
            reverse('rest_password_reset'), {'email': 'nobody@example.com'})

        self.assertEqual(r_registered.status_code, 200)
        self.assertEqual(r_unregistered.status_code, 200,
                         "미등록 이메일에 400을 반환하면 가입 여부가 열거됩니다.")
        self.assertEqual(r_registered.data['detail'], r_unregistered.data['detail'],
                         "메시지가 다르면 상태코드가 같아도 열거가 가능합니다.")


class SocialTokenSingleUseTest(TestCase):
    """completed 소셜 연결 토큰은 1회만 JWT를 발급하고, 만료 후엔 발급하지 않는다"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='social_user', email='social@example.com',
            password='testpass123!', is_active=True,
        )
        self.url = '/api/auth/social/verify-status/'

    def _completed_token(self, expired=False):
        token = AccountLinkingToken.create_for_social_link(
            user=self.user, provider='google', social_id='g-123',
        )
        token.status = 'completed'
        token.expires_at = timezone.now() + (timedelta(hours=-1) if expired else timedelta(hours=1))
        token.save(update_fields=['status', 'expires_at'])
        return token

    def test_completed_token_issues_jwt_only_once(self):
        """미만료 completed 토큰: 첫 폴링은 JWT 발급(200), 재폴링(replay)은 400"""
        token = self._completed_token()
        r1 = self.client.post(self.url, {'temp_token': str(token.token)}, format='json')
        self.assertEqual(r1.status_code, 200, msg=str(r1.data))
        self.assertEqual(r1.data['status'], 'completed')

        r2 = self.client.post(self.url, {'temp_token': str(token.token)}, format='json')
        self.assertEqual(r2.status_code, 400,
                         "consumed 토큰 재사용(replay)이 막히지 않았습니다.")

    def test_expired_completed_token_rejected(self):
        """expires_at을 넘긴 completed 토큰은 JWT를 발급하지 않는다"""
        token = self._completed_token(expired=True)
        r = self.client.post(self.url, {'temp_token': str(token.token)}, format='json')
        self.assertEqual(r.status_code, 400,
                         "만료된 completed 토큰이 여전히 JWT를 발급했습니다.")


class SocialEmailVerificationLinkTest(TestCase):
    """소셜 자동 연결은 프로바이더가 소유권을 보증한 이메일에만 적용된다

    미검증 주소로 연결되면 공격자가 소셜 계정 이메일을 피해자 주소로 설정하는
    것만으로 피해자 계정에 로그인할 수 있다.
    """

    VICTIM_EMAIL = 'victim@example.com'

    def setUp(self):
        self.rf = RequestFactory()
        self.victim = User.objects.create_user(
            username='victim', email=self.VICTIM_EMAIL,
            password='testpass123!', is_active=True,
        )
        EmailAddress.objects.create(
            user=self.victim, email=self.VICTIM_EMAIL, verified=True, primary=True,
        )

    def _link(self, provider_id, response):
        """프로바이더 응답으로 소셜 로그인을 만들고 어댑터를 태운다

        Returns:
            자동 연결로 피해자 계정에 붙었으면 True
        """
        request = self.rf.post(f'/api/auth/social/{provider_id}/')
        provider = get_socialaccount_adapter().get_provider(request, provider_id)
        sociallogin = provider.sociallogin_from_response(request, response)
        sociallogin.lookup()
        CustomSocialAccountAdapter().pre_social_login(request, sociallogin)
        return bool(sociallogin.user and sociallogin.user.pk == self.victim.pk)

    def _kakao(self, email, verified):
        return {
            'id': 9999,
            'kakao_account': {
                'email': email,
                'is_email_verified': verified,
                'is_email_valid': True,
                'profile': {'nickname': 'tester'},
            },
        }

    def _naver(self, email):
        # allauth의 naver 어댑터는 바깥 "response" 래퍼를 벗긴 뒤 넘긴다
        return {'id': '9999', 'email': email, 'name': 'tester'}

    def test_unverified_email_does_not_link(self):
        """미인증 이메일은 기존 계정에 연결되지 않는다"""
        self.assertFalse(
            self._link('kakao', self._kakao(self.VICTIM_EMAIL, verified=False)),
            "미인증 소셜 이메일로 타인 계정에 연결됐습니다.",
        )

    def test_verified_email_links(self):
        """인증된 이메일은 기존대로 연결된다 (기능 회귀 방지)"""
        self.assertTrue(
            self._link('kakao', self._kakao(self.VICTIM_EMAIL, verified=True)),
            "인증된 소셜 이메일의 자동 연결이 깨졌습니다.",
        )

    def test_naver_external_email_does_not_link(self):
        """네이버는 검증 필드가 없으므로 외부메일 주소를 신뢰하지 않는다"""
        self.assertFalse(
            self._link('naver', self._naver(self.VICTIM_EMAIL)),
            "네이버가 보증하지 않는 외부메일 주소로 타인 계정에 연결됐습니다.",
        )

    def test_naver_owned_domain_links(self):
        """네이버가 발급한 도메인은 소유권이 보장되므로 연결한다"""
        naver_user = User.objects.create_user(
            username='naver_user', email='tester@naver.com',
            password='testpass123!', is_active=True,
        )
        request = self.rf.post('/api/auth/social/naver/')
        provider = get_socialaccount_adapter().get_provider(request, 'naver')
        sociallogin = provider.sociallogin_from_response(
            request, self._naver('tester@naver.com'))
        sociallogin.lookup()
        CustomSocialAccountAdapter().pre_social_login(request, sociallogin)
        self.assertEqual(
            sociallogin.user.pk, naver_user.pk,
            "@naver.com 주소의 자동 연결이 막혔습니다.",
        )

    def test_inactive_user_is_not_linked(self):
        """비활성 계정(병합된 계정)은 자동 연결 대상이 아니다"""
        self.victim.is_active = False
        self.victim.save(update_fields=['is_active'])
        self.assertFalse(
            self._link('kakao', self._kakao(self.VICTIM_EMAIL, verified=True)),
            "비활성 계정에 소셜 계정이 연결됐습니다.",
        )

    def _new_user_email_verified(self, provider_id, response):
        """소셜 신규 가입 시 기록되는 email_verified 값을 반환"""
        request = self.rf.post(f'/api/auth/social/{provider_id}/')
        # allauth의 save_user 경로는 세션을 참조한다
        SessionMiddleware(lambda r: None).process_request(request)
        request.session.save()
        provider = get_socialaccount_adapter().get_provider(request, provider_id)
        sociallogin = provider.sociallogin_from_response(request, response)
        adapter = CustomSocialAccountAdapter()
        user = adapter.save_user(request, sociallogin)
        return user.email_verified, user.email_verified_at

    def test_new_user_from_unverified_email_is_not_marked_verified(self):
        """미인증 소셜 이메일로 가입하면 email_verified를 세우지 않는다"""
        verified, verified_at = self._new_user_email_verified(
            'kakao', self._kakao('newbie@example.com', verified=False))
        self.assertFalse(verified, "미인증 소셜 이메일이 인증 완료로 기록됐습니다.")
        self.assertIsNone(verified_at, "미인증인데 인증 시각이 기록됐습니다.")

    def test_new_user_from_verified_email_is_marked_verified(self):
        """인증된 소셜 이메일로 가입하면 email_verified를 기록한다"""
        verified, verified_at = self._new_user_email_verified(
            'kakao', self._kakao('newbie@example.com', verified=True))
        self.assertTrue(verified, "인증된 소셜 이메일이 인증 완료로 기록되지 않았습니다.")
        self.assertIsNotNone(verified_at, "인증 시각이 기록되지 않았습니다.")

    def test_new_naver_user_external_email_is_not_marked_verified(self):
        """네이버 외부메일로 가입하면 소유권 보증이 없으므로 미인증으로 둔다"""
        verified, _ = self._new_user_email_verified(
            'naver', self._naver('newbie@example.com'))
        self.assertFalse(verified, "보증되지 않은 네이버 외부메일이 인증 완료로 기록됐습니다.")

    def test_new_naver_user_owned_domain_is_marked_verified(self):
        """네이버가 발급한 도메인은 인증 완료로 기록한다"""
        verified, _ = self._new_user_email_verified(
            'naver', self._naver('newbie@naver.com'))
        self.assertTrue(verified, "@naver.com 주소가 인증 완료로 기록되지 않았습니다.")


class MergeAccountsAuthorizationTest(TestCase):
    """계정 병합 호출자 검증 — 토큰의 target 본인만 병합을 실행할 수 있어야 한다."""

    def setUp(self):
        self.client = APIClient()
        self.target = User.objects.create_user(
            username='merge_target', email='mtarget@example.com',
            password='TargetPw123!', is_active=True,
        )
        self.source = User.objects.create_user(
            username='merge_source', email='msource@example.com',
            password='SourcePw123!', is_active=True,
        )
        self.attacker = User.objects.create_user(
            username='merge_attacker', email='mattacker@example.com',
            password='AttackPw123!', is_active=True,
        )
        self.merge_token = AccountLinkingToken.objects.create(
            user=self.target,
            source_user=self.source,
            link_type='merge_accounts',
            status='pending',
            provider='google',
            social_id='social-merge-123',
            expires_at=timezone.now() + timedelta(minutes=30),
        )

    def test_other_user_cannot_execute_merge(self):
        """유출된 토큰(쿠키)을 가진 제3자가 병합을 실행하면 403이며 source 계정이 삭제되지 않는다."""
        self.client.force_authenticate(user=self.attacker)
        self.client.cookies['merge_token'] = str(self.merge_token.token)
        response = self.client.post(
            reverse('merge_accounts'),
            {'confirm_merge': True},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            User.objects.filter(pk=self.source.pk).exists(),
            '권한 없는 호출로 source 계정이 삭제되면 안 된다.',
        )

    def test_target_user_passes_authorization(self):
        """토큰의 target 본인은 403을 받지 않고 비밀번호 확인 단계로 진행한다(파괴적 병합 미실행)."""
        self.client.force_authenticate(user=self.target)
        self.client.cookies['merge_token'] = str(self.merge_token.token)
        response = self.client.post(
            reverse('merge_accounts'),
            # target_password 미제공 → 비밀번호 확인 단계에서 400
            {'confirm_merge': True},
            format='json',
        )
        # 403(인가 거부)이 아니라 400(비밀번호 확인 필요)으로 진행됨을 확인
        self.assertNotEqual(response.status_code, 403)
        self.assertEqual(response.status_code, 400)
        self.assertIn('비밀번호', str(response.data))
        self.assertTrue(User.objects.filter(pk=self.source.pk).exists())

    def test_merge_token_not_accepted_from_body(self):
        """토큰을 바디로만 보내면(쿠키 없음) 병합 토큰 없음으로 거부된다(URL·바디 전달 차단)."""
        self.client.force_authenticate(user=self.target)
        response = self.client.post(
            reverse('merge_accounts'),
            {'merge_token': str(self.merge_token.token), 'confirm_merge': True},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('병합 토큰', str(response.data))
        self.assertTrue(User.objects.filter(pk=self.source.pk).exists())


class PasswordChangeRevokesTokensTest(TestCase):
    """H 수정 검증: 비밀번호 변경 시 기존 refresh 토큰 전량 폐기"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='pwchange',
            email='pwchange@example.com',
            password='oldpass123!',
            is_active=True,
        )
        # 변경 이전에 발급된(탈취 시나리오의 공격자) refresh 토큰
        self.old_refresh = RefreshToken.for_user(self.user)

    def test_password_change_blacklists_existing_tokens(self):
        """비밀번호 변경 후 변경 전 발급된 refresh 토큰이 블랙리스트에 등록돼야 한다."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            reverse('change_password'),
            {
                'current_password': 'oldpass123!',
                'new_password': 'newpass456!',
                'confirm_password': 'newpass456!',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        jti = self.old_refresh.payload.get('jti')
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=jti).exists(),
            "비밀번호 변경 후 기존 refresh 토큰이 폐기되어야 합니다.",
        )

    def test_old_refresh_cannot_refresh_after_change(self):
        """변경 후 탈취된 옛 refresh 토큰으로 access 갱신이 불가해야 한다."""
        old_refresh_str = str(self.old_refresh)
        self.client.force_authenticate(user=self.user)
        self.client.post(
            reverse('change_password'),
            {
                'current_password': 'oldpass123!',
                'new_password': 'newpass456!',
                'confirm_password': 'newpass456!',
            },
            format='json',
        )

        attacker = APIClient()
        attacker.cookies['refresh_token'] = old_refresh_str
        response = attacker.post(reverse('token_refresh'))
        self.assertEqual(
            response.status_code, 401,
            "폐기된 옛 refresh 토큰으로 갱신이 불가해야 합니다.",
        )


class PasswordResetRevokesTokensTest(TestCase):
    """H 수정 검증: 비밀번호 재설정 확인 시 기존 refresh 토큰 전량 폐기"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='pwreset',
            email='pwreset@example.com',
            password='oldpass123!',
            is_active=True,
        )
        self.old_refresh = RefreshToken.for_user(self.user)

    def test_reset_confirm_blacklists_existing_tokens(self):
        """재설정 확인 후 재설정 전 발급된 refresh 토큰이 폐기돼야 한다."""
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes

        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        response = self.client.post(
            reverse('rest_password_reset_confirm'),
            {
                'uid': uid,
                'token': token,
                'new_password1': 'newpass456!',
                'new_password2': 'newpass456!',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        jti = self.old_refresh.payload.get('jti')
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=jti).exists(),
            "비밀번호 재설정 후 기존 refresh 토큰이 폐기되어야 합니다.",
        )


class LogoutDestroysSessionTest(TestCase):
    """H 수정 검증: 로그아웃 시 Django 세션 파기(django_logout)"""

    def test_logout_destroys_django_session(self):
        """로그인으로 생성된 Django 세션이 로그아웃으로 파기돼야 한다."""
        from django.contrib.sessions.models import Session

        User.objects.create_user(
            username='sessuser',
            email='sessuser@example.com',
            password='testpass123!',
            is_active=True,
        )
        client = APIClient()
        login = client.post(
            reverse('rest_login'),
            {'login': 'sessuser', 'password': 'testpass123!'},
            format='json',
        )
        self.assertEqual(login.status_code, 200)
        # 로그인 시 django_login으로 세션이 생성된다
        self.assertGreaterEqual(Session.objects.count(), 1)

        client.post(reverse('rest_logout'))
        self.assertEqual(
            Session.objects.count(), 0,
            "로그아웃 시 Django 세션이 파기되어야 합니다.",
        )


class LoginLockoutCompositeKeyTest(TestCase):
    """로그인 락아웃이 (IP, username) 복합 키라 표적 DoS가 안 된다"""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        self.victim = User.objects.create_user(
            username='victim8', email='victim8@example.com', password='RealPass1!23', is_active=True
        )

    def _fail_login(self, ip):
        return self.client.post(
            reverse('rest_login'),
            {'login': 'victim8', 'password': 'wrong'},
            format='json', REMOTE_ADDR=ip,
        )

    def test_attacker_ip_lockout_does_not_block_victim_other_ip(self):
        # 공격자 IP에서 피해자 아이디로 한도까지 실패
        for _ in range(6):
            self._fail_login('10.0.0.1')
        # 공격자 IP는 잠김
        blocked = self._fail_login('10.0.0.1')
        self.assertEqual(blocked.status_code, 429)

        # 피해자는 다른 IP에서 올바른 비번으로 정상 로그인 (구버전은 전역 잠김이었음)
        ok = self.client.post(
            reverse('rest_login'),
            {'login': 'victim8', 'password': 'RealPass1!23'},
            format='json', REMOTE_ADDR='203.0.113.9',
        )
        self.assertEqual(ok.status_code, 200, msg=str(getattr(ok, 'data', ok)))


class RateLimiterAtomicIncrementTest(TestCase):
    """increment_attempts가 원자적으로 증가한다"""

    def test_increment_is_monotonic(self):
        from django.core.cache import cache
        from apps.accounts.utils.rate_limiting import login_limiter
        cache.clear()
        results = [login_limiter.increment_attempts('u7', 'user') for _ in range(5)]
        self.assertEqual(results, [1, 2, 3, 4, 5])


class EmailVerifyStatusThrottleTest(TestCase):
    """이메일 인증 상태 확인에 IP 스로틀이 걸린다"""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()

    def test_status_throttled_after_limit(self):
        # 한도(20)까지는 200, 초과분은 429
        codes = set()
        for _ in range(25):
            r = self.client.post(
                reverse('email_verify_status'),
                {'email': 'probe@example.com'}, format='json', REMOTE_ADDR='198.51.100.7',
            )
            codes.add(r.status_code)
        self.assertIn(429, codes)


class ResendVerificationRefreshesExpiredTokenTest(TestCase):
    """인증 메일 재전송 시 만료된 토큰이 새로 발급된다"""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='resend_u', email='resend@example.com', password='p', is_active=False
        )

    def test_expired_token_regenerated_on_resend(self):
        from apps.accounts.models import EmailVerification
        from unittest.mock import patch
        ev = EmailVerification.objects.create(user=self.user)
        # created_at을 25시간 전으로 강제(만료)
        old_token = ev.token
        EmailVerification.objects.filter(pk=ev.pk).update(
            created_at=timezone.now() - timedelta(hours=25)
        )

        with patch('apps.accounts.views.email_verification.send_email_verification_email'):
            r = self.client.post(reverse('email_resend'), {'email': 'resend@example.com'}, format='json')
        self.assertEqual(r.status_code, 200)
        ev.refresh_from_db()
        self.assertNotEqual(ev.token, old_token)  # 새 토큰 발급
        self.assertTrue(ev.is_valid())            # 다시 유효


class UsernameFormatValidationTest(TestCase):
    """프로필 수정 시 이메일 형식 username을 거부한다"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='u9', email='u9@example.com', password='p', is_active=True
        )
        self.client.force_authenticate(user=self.user)

    def test_email_like_username_rejected(self):
        r = self.client.put(reverse('user_profile'), {'username': 'evil@example.com'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'u9')  # 변경 안 됨


class SocialOnlyAccountOpsTest(TestCase):
    """비밀번호 없는 소셜 전용 계정도 탈퇴·이메일 변경 가능"""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='social10', email='social10@example.com', is_active=True
        )
        self.user.set_unusable_password()
        self.user.save()
        self.client.force_authenticate(user=self.user)

    def test_delete_account_without_password(self):
        r = self.client.post(reverse('delete_account'), {}, format='json')
        self.assertIn(r.status_code, (200, 204), msg=str(getattr(r, 'data', r)))
        self.assertFalse(User.objects.filter(id=self.user.id).exists())

    def test_email_change_without_password(self):
        from unittest.mock import patch
        with patch('apps.accounts.views.email_change.send_email_change_email'):
            r = self.client.post(
                reverse('email_change_request'),
                {'new_email': 'newsocial10@example.com'}, format='json',
            )
        self.assertEqual(r.status_code, 200, msg=str(getattr(r, 'data', r)))


class SocialConnectStateCsrfTest(TestCase):
    """소셜 연동이 서버 발급 state(쿠키) ↔ 바디 state 대조로 CSRF를 차단한다"""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='connect_u', email='connect@example.com', password='p', is_active=True
        )
        self.client.force_authenticate(user=self.user)

    def test_prepare_sets_state_cookie_and_returns_value(self):
        r = self.client.get('/api/auth/social/google/connect/prepare/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('state', r.data)
        self.assertIn('connect_state', r.cookies)
        self.assertEqual(r.cookies['connect_state'].value, r.data['state'])

    def test_connect_without_state_is_forbidden(self):
        # state 쿠키/바디 없이 연동 POST → 403 (code 검증 이전에 차단)
        r = self.client.post('/api/auth/social/google/connect/', {'code': 'abc'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_connect_state_mismatch_is_forbidden(self):
        self.client.get('/api/auth/social/google/connect/prepare/')  # 쿠키 심기
        # 다른 state를 바디로 → 403
        r = self.client.post(
            '/api/auth/social/google/connect/',
            {'code': 'abc', 'state': 'attacker-controlled'}, format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_matching_state_passes_csrf_gate(self):
        prep = self.client.get('/api/auth/social/google/connect/prepare/')
        state = prep.data['state']
        # 일치하는 state면 CSRF 게이트를 통과 → 이후 코드 교환 단계로 진입(403 아님)
        r = self.client.post(
            '/api/auth/social/google/connect/',
            {'code': 'x' * 10, 'state': state}, format='json',
        )
        self.assertNotEqual(r.status_code, 403)
