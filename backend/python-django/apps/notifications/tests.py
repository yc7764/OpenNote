"""
notifications 앱 테스트

문의 답변 알림 태스크의 멱등성 검증 (SMTP 재시도 발송 보장)
"""
from smtplib import SMTPException
from unittest.mock import patch

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.cache import cache

from apps.support.models import ContactInquiry
from apps.notifications.models import Notification
from apps.notifications.tasks import send_inquiry_reply_notification

User = get_user_model()


class InquiryReplyNotificationIdempotencyTest(TestCase):
    """멱등 키가 발송 성공 후에만 세팅되어, 실패 후 재시도가 실제로 재발송된다"""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username='notif_u', email='notif@example.com', password='p'
        )
        self.inquiry = ContactInquiry.objects.create(
            user=self.user, name='n', email='notif@example.com',
            subject='제목', message='내용', admin_reply='답변드립니다.',
        )
        self.key = f'{self.inquiry.pk}:reply1'

    def test_retry_resends_email_after_failure(self):
        # 1차: 이메일 발송이 SMTP 오류로 실패 → autoretry 대상 예외 재발생
        with patch('apps.notifications.tasks.send_inquiry_reply_email',
                   side_effect=SMTPException('smtp down')) as mock_send:
            with self.assertRaises(SMTPException):
                send_inquiry_reply_notification.run(self.inquiry.pk, self.key)
        self.assertEqual(mock_send.call_count, 1)
        # 인앱 알림은 생성됐어야 함
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

        # 2차(재시도): 이번엔 성공 → 이메일이 실제로 재발송돼야 한다
        # (구버전은 발송 전 멱등 키를 세팅해 여기서 duplicate로 건너뛰었다)
        with patch('apps.notifications.tasks.send_inquiry_reply_email') as mock_send2:
            result = send_inquiry_reply_notification.run(self.inquiry.pk, self.key)
        self.assertEqual(mock_send2.call_count, 1)
        # 인앱 알림은 중복 생성되지 않아야 한다
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

    def test_full_duplicate_skips_after_success(self):
        with patch('apps.notifications.tasks.send_inquiry_reply_email') as mock_send:
            send_inquiry_reply_notification.run(self.inquiry.pk, self.key)
        self.assertEqual(mock_send.call_count, 1)

        # 완전히 처리된 뒤 같은 키로 재호출하면 아무것도 안 함
        with patch('apps.notifications.tasks.send_inquiry_reply_email') as mock_send2:
            result = send_inquiry_reply_notification.run(self.inquiry.pk, self.key)
        self.assertEqual(mock_send2.call_count, 0)
        self.assertEqual(result['status'], 'duplicate')
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)
