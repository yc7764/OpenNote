"""
헬퍼 함수 및 상수
"""
import hashlib
import logging
import requests
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

User = get_user_model()
logger = logging.getLogger(__name__)


# === Master Account 시스템 상수 ===
LINK_STATE_PREFIX = 'LINK_'  # OAuth state에서 연결 모드 식별


# social_django 백엔드 이름을 내부 provider 이름으로 매핑
BACKEND_TO_PROVIDER = {
    'github': 'github',
    'google-oauth2': 'google',
    'naver': 'naver',
    'kakao': 'kakao',
}

# 지원되는 소셜 백엔드 목록
SUPPORTED_BACKENDS = list(BACKEND_TO_PROVIDER.keys())


def safe_get_response_data(response, key, default='', max_length=None):
    """
    소셜 서비스 응답에서 안전하게 데이터를 추출하는 함수

    Args:
        response: 소셜 서비스 응답 데이터
        key: 추출할 키
        default: 기본값
        max_length: 최대 길이 제한

    Returns:
        추출된 데이터 (문자열)
    """
    try:
        value = response.get(key, default)

        # None 값 처리
        if value is None:
            return default

        # 문자열로 변환
        value = str(value).strip()

        # 최대 길이 제한
        if max_length and len(value) > max_length:
            value = value[:max_length]
            logger.warning(f"Value for key '{key}' truncated to {max_length} characters")

        return value
    except Exception as e:
        logger.error(f"Error extracting data for key '{key}': {str(e)}")
        return default


def validate_social_data(backend, response):
    """
    소셜 서비스 응답 데이터 검증

    Args:
        backend: 소셜 백엔드 객체
        response: 소셜 서비스 응답 데이터

    Returns:
        검증된 데이터 딕셔너리
    """
    errors = []
    validated_data = {}

    # 필수 필드 검증 - 소셜 서비스별로 ID 필드가 다름
    if backend.name == 'google-oauth2':
        # Google OAuth2는 'sub' 필드에 사용자 ID를 반환
        social_id = safe_get_response_data(response, 'sub')
    else:
        # GitHub, Naver, Kakao 등은 'id' 필드 사용
        social_id = safe_get_response_data(response, 'id')

    if not social_id:
        logger.error(f"Missing social ID for {backend.name}. Response keys: {list(response.keys()) if isinstance(response, dict) else 'N/A'}")
        errors.append("소셜 서비스에서 사용자 ID를 받지 못했습니다.")
    else:
        validated_data['social_id'] = str(social_id)

    # 이메일 검증 - 소셜 서비스별로 위치가 다름
    social_email = ''
    if backend.name == 'kakao':
        # Kakao: kakao_account.email
        kakao_account = response.get('kakao_account', {})
        social_email = kakao_account.get('email', '') if isinstance(kakao_account, dict) else ''
    elif backend.name == 'naver':
        # Naver: response.email (social_django가 이미 파싱할 수 있음)
        naver_response = response.get('response', response)
        social_email = naver_response.get('email', '') if isinstance(naver_response, dict) else safe_get_response_data(response, 'email')
    else:
        social_email = safe_get_response_data(response, 'email')

    if social_email and '@' not in social_email:
        errors.append("유효하지 않은 이메일 형식입니다.")
        social_email = ''
    validated_data['social_email'] = social_email

    # 이름 검증 - 소셜 서비스별로 위치가 다름
    social_name = ''
    if backend.name == 'kakao':
        # Kakao: kakao_account.profile.nickname
        kakao_account = response.get('kakao_account', {})
        profile = kakao_account.get('profile', {}) if isinstance(kakao_account, dict) else {}
        social_name = profile.get('nickname', '') if isinstance(profile, dict) else ''
        # properties에서도 시도
        if not social_name:
            properties = response.get('properties', {})
            social_name = properties.get('nickname', '') if isinstance(properties, dict) else ''
    elif backend.name == 'naver':
        # Naver: response.name 또는 response.nickname
        naver_response = response.get('response', response)
        if isinstance(naver_response, dict):
            social_name = naver_response.get('name', '') or naver_response.get('nickname', '')
        else:
            social_name = safe_get_response_data(response, 'name', max_length=255)
    else:
        social_name = safe_get_response_data(response, 'name', max_length=255)

    validated_data['social_name'] = social_name[:255] if social_name else ''

    # 추가 필드들 (소셜 서비스별로 다를 수 있음)
    if backend.name == 'github':
        # GitHub 특정 필드들
        login = safe_get_response_data(response, 'login', max_length=150)
        if login and not validated_data.get('social_name'):
            validated_data['social_name'] = login

    elif backend.name == 'google-oauth2':
        # Google 특정 필드들 (백엔드 이름: google-oauth2)
        given_name = safe_get_response_data(response, 'given_name', max_length=150)
        family_name = safe_get_response_data(response, 'family_name', max_length=150)
        if given_name or family_name:
            full_name = f"{given_name} {family_name}".strip()
            if full_name and not validated_data.get('social_name'):
                validated_data['social_name'] = full_name

    # 검증 오류가 있으면 로그 기록
    if errors:
        logger.error(f"Social auth validation errors for {backend.name}: {errors}")

    return validated_data, errors


def generate_unique_username(base_username):
    """고유한 사용자명 생성"""
    if not base_username:
        base_username = 'user'

    # 특수문자 제거 및 길이 제한
    username = ''.join(c for c in base_username if c.isalnum() or c in '._-')
    username = username[:30]  # Django username 필드 최대 길이

    if not username:
        username = 'user'

    counter = 1
    original_username = username

    while User.objects.filter(username=username).exists():
        username = f"{original_username}_{counter}"
        if len(username) > 30:
            username = f"{original_username[:20]}_{counter}"
        counter += 1
        if counter > 1000:  # 무한 루프 방지
            raise ValidationError("사용자명 생성에 실패했습니다.")

    return username


def split_name(full_name):
    """전체 이름을 성과 이름으로 분리"""
    if not full_name:
        return '', ''

    try:
        name_parts = full_name.strip().split()
        if len(name_parts) == 1:
            return name_parts[0], ''
        elif len(name_parts) >= 2:
            first_name = name_parts[0]
            last_name = ' '.join(name_parts[1:])
            # Django 필드 길이 제한
            return first_name[:150], last_name[:150]
        return '', ''
    except Exception as e:
        logger.error(f"Error splitting name '{full_name}': {str(e)}")
        return '', ''


def get_provider_name(backend_name):
    """social_django 백엔드 이름을 내부 provider 이름으로 변환"""
    return BACKEND_TO_PROVIDER.get(backend_name, backend_name)


def get_github_primary_email(access_token: str) -> str | None:
    """
    GitHub API를 사용하여 사용자의 primary 이메일 조회

    GitHub 사용자가 이메일을 비공개로 설정한 경우에도
    OAuth scope에 user:email이 있으면 조회 가능

    Args:
        access_token: GitHub OAuth access token

    Returns:
        primary 이메일 주소 또는 None
    """
    try:
        response = requests.get(
            'https://api.github.com/user/emails',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Accept': 'application/vnd.github.v3+json',
            },
            timeout=10
        )
        response.raise_for_status()

        emails = response.json()

        if not emails:
            logger.warning("GitHub API returned empty email list")
            return None

        # 1. primary 이메일 찾기
        for email_data in emails:
            if email_data.get('primary') and email_data.get('verified'):
                email = email_data.get('email')
                logger.info(f"Found GitHub primary email: {email[:3]}***")
                return email

        # 2. primary가 없으면 verified된 첫 번째 이메일
        for email_data in emails:
            if email_data.get('verified'):
                email = email_data.get('email')
                logger.info(f"Found GitHub verified email (non-primary): {email[:3]}***")
                return email

        # 3. verified도 없으면 첫 번째 이메일
        if emails:
            email = emails[0].get('email')
            logger.warning(f"Using unverified GitHub email: {email[:3]}***")
            return email

        return None

    except requests.RequestException as e:
        logger.error(f"Failed to get GitHub primary email: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error getting GitHub email: {str(e)}")
        return None


def generate_display_name(provider: str, social_id: str, extra_data: dict) -> str:
    """
    이름이 없을 때 대체 이름 생성

    우선순위:
    1. 프로바이더별 대체 필드 (login, nickname 등)
    2. 이메일 로컬 파트 (user@example.com → user)
    3. 프로바이더 + 짧은 해시 (GitHub User #a1b2)

    Args:
        provider: 소셜 프로바이더 이름 (github, google, naver, kakao)
        social_id: 소셜 서비스의 사용자 ID
        extra_data: 소셜 서비스 응답 데이터

    Returns:
        생성된 표시 이름 (최대 255자)
    """
    # 1. 프로바이더별 대체 필드 시도
    fallback_fields = {
        'github': ['login', 'node_id'],
        'google': ['given_name'],
        'google-oauth2': ['given_name'],
        'kakao': [],  # 이미 properties.nickname에서 시도됨
        'naver': [],  # 이미 response.nickname에서 시도됨
    }

    for field in fallback_fields.get(provider, []):
        value = _get_nested_value(extra_data, field)
        if value:
            logger.info(f"Generated display name from {field}: {value[:20]}...")
            return str(value)[:255]

    # Kakao: properties.nickname 또는 kakao_account.profile.nickname
    if provider == 'kakao':
        props = extra_data.get('properties', {})
        if props.get('nickname'):
            return str(props['nickname'])[:255]
        kakao_account = extra_data.get('kakao_account', {})
        profile = kakao_account.get('profile', {})
        if profile.get('nickname'):
            return str(profile['nickname'])[:255]

    # Naver: response.nickname
    if provider == 'naver':
        naver_response = extra_data.get('response', extra_data)
        if naver_response.get('nickname'):
            return str(naver_response['nickname'])[:255]

    # 2. 이메일 로컬 파트 시도
    email = _extract_email_from_response(provider, extra_data)
    if email and '@' in email:
        local_part = email.split('@')[0]
        # 특수문자 제거하고 유효한 부분만 사용
        clean_name = ''.join(c for c in local_part if c.isalnum() or c in '._-')
        if clean_name and len(clean_name) >= 2:
            logger.info(f"Generated display name from email: {clean_name[:20]}...")
            return clean_name[:255]

    # 3. 프로바이더 + 짧은 해시
    short_hash = hashlib.md5(str(social_id).encode()).hexdigest()[:6]
    provider_display = {
        'github': 'GitHub',
        'google': 'Google',
        'google-oauth2': 'Google',
        'naver': 'Naver',
        'kakao': 'Kakao',
    }.get(provider, provider.capitalize())

    generated_name = f"{provider_display} User #{short_hash}"
    logger.info(f"Generated fallback display name: {generated_name}")
    return generated_name


def _get_nested_value(data: dict, key: str):
    """중첩된 딕셔너리에서 값 추출 (점 표기법 지원)"""
    if not data or not key:
        return None

    keys = key.split('.')
    value = data

    for k in keys:
        if isinstance(value, dict):
            value = value.get(k)
        else:
            return None

    return value


def _extract_email_from_response(provider: str, extra_data: dict) -> str | None:
    """프로바이더별 응답에서 이메일 추출"""
    if provider == 'kakao':
        kakao_account = extra_data.get('kakao_account', {})
        return kakao_account.get('email') if isinstance(kakao_account, dict) else None
    elif provider == 'naver':
        naver_response = extra_data.get('response', extra_data)
        return naver_response.get('email') if isinstance(naver_response, dict) else None
    else:
        return extra_data.get('email')
