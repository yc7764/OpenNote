"""S3/MinIO 클라이언트 싱글톤 관리

이 모듈은 boto3 S3 클라이언트를 싱글톤으로 관리하여
매 요청마다 클라이언트를 생성하는 오버헤드(50-80ms)를 제거합니다.
gevent 환경에서 thread-safe하게 동작합니다.
"""
import time
import logging
import boto3
from botocore.config import Config
from django.conf import settings
from gevent.lock import Semaphore

logger = logging.getLogger(__name__)

_s3_client = None
_lock = Semaphore()  # gevent 네이티브 락 (greenlet 안전)
_last_error_time = 0
_ERROR_RETRY_INTERVAL = 30  # 실패 후 30초 대기 후 재시도


def get_s3_client():
    """S3 클라이언트 싱글톤 반환 (thread-safe, 복구 가능)

    Returns:
        boto3.client: 설정된 S3 클라이언트

    Raises:
        RuntimeError: S3 클라이언트 생성 실패 시 (재시도 대기 중 포함)

    Note:
        - Double-checked locking 패턴 사용
        - gevent greenlet에서 안전하게 동작 (Semaphore 사용)
        - 초기화 실패 시 30초 후 재시도 가능 (복구 로직)
        - AWS_S3_ENDPOINT_URL을 사용하여 내부 MinIO에 직접 연결
    """
    global _s3_client, _last_error_time

    # 이미 생성된 클라이언트가 있으면 바로 반환
    if _s3_client is not None:
        return _s3_client

    # 최근 실패 후 재시도 간격 체크
    if _last_error_time and (time.time() - _last_error_time) < _ERROR_RETRY_INTERVAL:
        remaining = int(_ERROR_RETRY_INTERVAL - (time.time() - _last_error_time))
        raise RuntimeError(f"S3 클라이언트 초기화 실패 (재시도까지 {remaining}초 대기)")

    with _lock:
        # Double-checked locking
        if _s3_client is not None:
            return _s3_client

        try:
            _s3_client = boto3.client(
                's3',
                endpoint_url=settings.AWS_S3_ENDPOINT_URL,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                # MinIO 인증서를 사설 CA로 발급했으므로 시스템 신뢰 저장소에 없다.
                # 이 값을 넘기지 않으면 HTTPS 엔드포인트에서
                # CERTIFICATE_VERIFY_FAILED로 실패한다.
                # django-storages는 settings.AWS_S3_VERIFY를 자동으로 사용하지만
                # 직접 만든 클라이언트에는 명시적으로 전달해야 한다.
                verify=settings.AWS_S3_VERIFY,
                config=Config(
                    signature_version='s3v4',
                    connect_timeout=5,
                    read_timeout=300,  # Gunicorn timeout(300s)과 일치
                    max_pool_connections=100,  # 동시 연결 여유 확보 (50→100)
                ),
            )
            # 성공 시 에러 상태 초기화
            _last_error_time = 0
            logger.info("S3 클라이언트 초기화 성공")
            return _s3_client
        except Exception as e:
            _last_error_time = time.time()
            logger.error(f"S3 클라이언트 생성 실패: {e}")
            raise RuntimeError(f"S3 클라이언트 생성 실패: {e}")
