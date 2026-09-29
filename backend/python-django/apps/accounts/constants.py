"""accounts 앱 공용 상수.

임포트 부작용이 없도록 다른 모듈을 import하지 않는다(순환 import 방지).
"""

# 계정 병합 토큰을 URL 쿼리 대신 HttpOnly 쿠키로 전달하기 위한 쿠키명.
# (URL 노출 시 서버 액세스 로그·Referer·브라우저 히스토리로 유출되던 문제 차단)
MERGE_TOKEN_COOKIE = 'merge_token'
# 소셜 연동 CSRF 방어용 서버 발급 state 쿠키
CONNECT_STATE_COOKIE = 'connect_state'
# 소셜 로그인 이메일 입력 플로우의 임시 토큰. sessionStorage(JS 접근 가능) 대신
# HttpOnly 쿠키로 전달해 XSS 탈취 표면을 없앤다. 토큰 수명(30분)과 동일하게 만료.
SOCIAL_TEMP_TOKEN_COOKIE = 'social_temp_token'
SOCIAL_TEMP_TOKEN_MAX_AGE = 30 * 60  # 초 단위, AccountLinkingToken expires_at과 일치
