# celery_workers/common/broker.py
"""
브로커(RabbitMQ) 직접 조회 헬퍼

Celery 앱의 connection_for_read()/connection_for_write()를 거쳐야
settings의 CELERY_BROKER_USE_SSL(사설 CA·CERT_REQUIRED)이 함께 전달된다.
raw kombu.Connection(app.conf.broker_url)은 이 옵션을 읽지 않아
amqps:// 환경에서 시스템 CA로 검증하다 CERTIFICATE_VERIFY_FAILED로 실패했다.
"""


def get_queue_depth(app, queue_name: str) -> int:
    """큐에 쌓인 메시지 수를 돌려준다.

    passive 선언이라 큐를 만들지 않는다. 큐가 아직 없으면
    amqp.exceptions.NotFound가 그대로 올라오니 호출 측에서 처리한다.
    """
    with app.connection_for_read() as conn:
        with conn.channel() as channel:
            return channel.queue_declare(queue=queue_name, passive=True).message_count
