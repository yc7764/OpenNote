import struct
import uuid
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()

# ---------------------------------------------------------------------------
# 테스트용 파일 헤더 상수
# ---------------------------------------------------------------------------
# 실제 오디오 매직 바이트 (libmagic이 audio/* 로 인식하는 헤더)
MP3_HEADER  = b'\xff\xfb\x90\x00' + b'\x00' * 200   # MPEG frame sync
WAV_HEADER  = b'RIFF' + struct.pack('<I', 36) + b'WAVE' + b'fmt ' + b'\x10\x00\x00\x00' + b'\x00' * 80
FLAC_HEADER = b'fLaC' + b'\x00' * 200
OGG_HEADER  = b'OggS' + b'\x00' * 200

# 악성/위장 파일 헤더
EXE_HEADER  = b'MZ' + b'\x00' * 200          # Windows PE 실행 파일
PDF_HEADER  = b'%PDF-1.4' + b'\x00' * 200    # PDF 문서
HTML_HEADER = b'<html><body>' + b'\x00' * 200 # HTML (XSS 시도)
ZIP_HEADER  = b'PK\x03\x04' + b'\x00' * 200  # ZIP 아카이브


class AudioUploadExtensionValidationTest(TestCase):
    """1차 방어: 파일 확장자 검사"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser_ext',
            email='test_ext@example.com',
            password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def _upload(self, filename, content=MP3_HEADER, mime_return='audio/mpeg'):
        f = SimpleUploadedFile(filename, content, content_type='application/octet-stream')
        mock_result = type('R', (), {'id': str(uuid.uuid4())})()
        with patch('apps.notes.views.magic.from_buffer', return_value=mime_return), \
             patch('celery.app.base.Celery.send_task', return_value=mock_result):
            return self.client.post('/api/notes/create/', {'audio_file': f, 'title': 'test'}, format='multipart')

    def test_allowed_extensions_pass(self):
        """허용된 확장자는 확장자 검사를 통과한다"""
        allowed = [
            ('test.mp3',  MP3_HEADER,  'audio/mpeg'),
            ('test.wav',  WAV_HEADER,  'audio/wav'),
            ('test.flac', FLAC_HEADER, 'audio/flac'),
            ('test.ogg',  OGG_HEADER,  'audio/ogg'),
            ('test.m4a',  b'\x00\x00\x00\x20ftyp' + b'\x00'*200, 'audio/mp4'),
        ]
        for filename, content, mime in allowed:
            with self.subTest(filename=filename):
                resp = self._upload(filename, content, mime)
                self.assertNotEqual(
                    resp.status_code, status.HTTP_400_BAD_REQUEST,
                    msg=f"{filename} 은 확장자 오류로 거부되면 안 됨 (응답: {resp.data})"
                )

    def test_blocked_extensions_rejected(self):
        """허용되지 않은 확장자는 MIME 검사 전에 차단된다"""
        blocked = ['malware.exe', 'script.sh', 'doc.pdf', 'archive.zip', 'page.html', 'data.txt']
        for filename in blocked:
            with self.subTest(filename=filename):
                f = SimpleUploadedFile(filename, EXE_HEADER, content_type='application/octet-stream')
                # magic.from_buffer 가 호출되지 않아야 함 (확장자에서 이미 차단)
                with patch('apps.notes.views.magic.from_buffer') as mock_magic:
                    resp = self.client.post('/api/notes/create/', {'audio_file': f, 'title': 'test'}, format='multipart')
                    mock_magic.assert_not_called()
                self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('음원 파일만', resp.data['error'])

    def test_no_extension_rejected(self):
        """확장자 없는 파일은 차단된다"""
        f = SimpleUploadedFile('audiofile', MP3_HEADER, content_type='application/octet-stream')
        with patch('apps.notes.views.magic.from_buffer') as mock_magic:
            resp = self.client.post('/api/notes/create/', {'audio_file': f, 'title': 'test'}, format='multipart')
            mock_magic.assert_not_called()
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_double_extension_rejected(self):
        """이중 확장자 위장(.mp3.exe)은 차단된다"""
        f = SimpleUploadedFile('malware.mp3.exe', EXE_HEADER, content_type='application/octet-stream')
        with patch('apps.notes.views.magic.from_buffer') as mock_magic:
            resp = self.client.post('/api/notes/create/', {'audio_file': f, 'title': 'test'}, format='multipart')
            mock_magic.assert_not_called()
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_extension_case_insensitive(self):
        """확장자 대소문자 무관하게 처리된다 (.MP3, .Mp3)"""
        for filename in ['test.MP3', 'test.Mp3', 'test.WAV']:
            with self.subTest(filename=filename):
                resp = self._upload(filename)
                self.assertNotEqual(resp.status_code, status.HTTP_400_BAD_REQUEST,
                                    msg=f"{filename} 은 대소문자로 거부되면 안 됨")


class AudioUploadMimeValidationTest(TestCase):
    """2차 방어: MIME 타입 검사 (파일 실제 내용 기반)"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser_mime',
            email='test_mime@example.com',
            password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def _upload_with_mime(self, filename, content, detected_mime):
        f = SimpleUploadedFile(filename, content, content_type='audio/mpeg')
        mock_result = type('R', (), {'id': str(uuid.uuid4())})()
        with patch('apps.notes.views.magic.from_buffer', return_value=detected_mime), \
             patch('celery.app.base.Celery.send_task', return_value=mock_result):
            return self.client.post('/api/notes/create/', {'audio_file': f, 'title': 'test'}, format='multipart')

    def test_exe_disguised_as_mp3_blocked(self):
        """EXE 헤더 파일을 .mp3로 위장 → MIME 검사에서 차단"""
        resp = self._upload_with_mime('malware.mp3', EXE_HEADER, 'application/x-dosexec')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('유효하지 않은 파일 형식', resp.data['error'])

    def test_pdf_disguised_as_mp3_blocked(self):
        """PDF 파일을 .mp3로 위장 → MIME 검사에서 차단"""
        resp = self._upload_with_mime('document.mp3', PDF_HEADER, 'application/pdf')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('유효하지 않은 파일 형식', resp.data['error'])

    def test_zip_disguised_as_mp3_blocked(self):
        """ZIP 파일을 .mp3로 위장 → MIME 검사에서 차단"""
        resp = self._upload_with_mime('archive.mp3', ZIP_HEADER, 'application/zip')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_html_disguised_as_wav_blocked(self):
        """HTML 파일을 .wav로 위장 → MIME 검사에서 차단 (저장 후 XSS 방지)"""
        resp = self._upload_with_mime('xss.wav', HTML_HEADER, 'text/html')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_valid_mp3_content_passes(self):
        """실제 MP3 헤더 파일은 MIME 검사를 통과한다"""
        resp = self._upload_with_mime('real.mp3', MP3_HEADER, 'audio/mpeg')
        self.assertNotEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_valid_wav_content_passes(self):
        """실제 WAV 헤더 파일은 MIME 검사를 통과한다"""
        resp = self._upload_with_mime('real.wav', WAV_HEADER, 'audio/wav')
        self.assertNotEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_valid_flac_content_passes(self):
        """실제 FLAC 헤더 파일은 MIME 검사를 통과한다"""
        resp = self._upload_with_mime('real.flac', FLAC_HEADER, 'audio/flac')
        self.assertNotEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_octet_stream_disguised_as_mp3_blocked(self):
        """application/octet-stream으로 감지되는 바이너리 → 차단"""
        resp = self._upload_with_mime('binary.mp3', b'\x00\x01\x02\x03' * 100, 'application/octet-stream')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)



class AudioUploadNoFileTest(TestCase):
    """파일 미첨부 케이스"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser_nofile',
            email='test_nofile@example.com',
            password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def test_no_file_returns_400(self):
        """파일 없이 요청 시 400 반환"""
        resp = self.client.post('/api/notes/create/', {'title': 'test'}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('음원 파일을 업로드해야 합니다', resp.data['error'])

    def test_unauthenticated_request_blocked(self):
        """인증 없는 요청은 차단된다"""
        anon_client = APIClient()
        f = SimpleUploadedFile('test.mp3', MP3_HEADER, content_type='audio/mpeg')
        resp = anon_client.post('/api/notes/create/', {'audio_file': f, 'title': 'test'}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class NoteMetadataValidationTest(TestCase):
    """user_keywords 개수(≤20)·길이(≤50), user_description 길이(≤2000) 검증"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='meta_user', email='meta@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def _post(self, extra):
        f = SimpleUploadedFile('test.mp3', MP3_HEADER, content_type='application/octet-stream')
        mock_result = type('R', (), {'id': str(uuid.uuid4())})()
        payload = {'audio_file': f, 'title': 'test', **extra}
        with patch('apps.notes.views.magic.from_buffer', return_value='audio/mpeg'), \
             patch('celery.app.base.Celery.send_task', return_value=mock_result):
            return self.client.post('/api/notes/create/', payload, format='multipart')

    def test_too_many_keywords_rejected(self):
        r = self._post({'keywords': ','.join(f'k{i}' for i in range(21))})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('키워드', r.data['error'])

    def test_too_long_keyword_rejected(self):
        r = self._post({'keywords': 'a' * 51})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_too_long_description_rejected(self):
        r = self._post({'description': 'x' * 2001})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('설명', r.data['error'])

    def test_valid_metadata_passes(self):
        r = self._post({'keywords': 'a,b,c', 'description': 'short desc'})
        self.assertNotEqual(r.status_code, status.HTTP_400_BAD_REQUEST, msg=str(r.data))


class NoteCreateOnCommitTaskTest(TestCase):
    """Celery task는 커밋 이후 on_commit으로 제출되고 ProcessingTask.celery_task_id와 일치한다"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='oncommit_user', email='oncommit@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def test_task_submitted_on_commit_with_matching_id(self):
        from apps.notes.models import ProcessingTask
        f = SimpleUploadedFile('test.mp3', MP3_HEADER, content_type='application/octet-stream')
        with patch('apps.notes.views.magic.from_buffer', return_value='audio/mpeg'), \
             patch('celery.app.base.Celery.send_task') as mock_send:
            with self.captureOnCommitCallbacks(execute=True):
                r = self.client.post(
                    '/api/notes/create/', {'audio_file': f, 'title': 't'}, format='multipart'
                )

        self.assertEqual(r.status_code, status.HTTP_201_CREATED, msg=str(r.data))
        # on_commit 콜백이 실행되어 send_task가 정확히 1회 호출됨
        mock_send.assert_called_once()
        # 미리 생성한 task_id로 제출됐고 응답·ProcessingTask와 일치
        called_task_id = mock_send.call_args.kwargs['task_id']
        self.assertEqual(called_task_id, r.data['task_id'])
        self.assertTrue(
            ProcessingTask.objects.filter(celery_task_id=r.data['task_id']).exists()
        )


class EmptyTrashAtomicTest(TestCase):
    """empty_trash는 휴지통의 모든 노트를 삭제한다(트랜잭션 원자화 후 동작 보존)"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='trash_user', email='trash@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def test_empty_trash_deletes_all_trashed_notes(self):
        from apps.notes.models import Note
        now = timezone.now()
        for i in range(3):
            Note.objects.create(user=self.user, title=f't{i}', deleted_at=now)
        # 살아있는 노트 1개는 남아야 함
        Note.objects.create(user=self.user, title='alive')

        self.assertEqual(Note.all_objects.filter(user=self.user, deleted_at__isnull=False).count(), 3)

        r = self.client.delete('/api/notes/empty-trash/')
        self.assertEqual(r.status_code, 200, msg=str(getattr(r, 'data', r)))
        self.assertEqual(r.data['count'], 3)
        # 휴지통은 비고, 살아있는 노트는 유지
        self.assertEqual(Note.all_objects.filter(user=self.user, deleted_at__isnull=False).count(), 0)
        self.assertEqual(Note.objects.filter(user=self.user).count(), 1)


class TrashPaginationTest(TestCase):
    """휴지통 목록이 서버사이드로 검색/페이지네이션된다"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='trashpg_user', email='trashpg@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def test_trash_list_paginates(self):
        from apps.notes.models import Note
        now = timezone.now()
        for i in range(25):
            Note.objects.create(user=self.user, title=f't{i}', deleted_at=now)

        resp = self.client.get('/api/notes/trash/?page_size=10&page=1')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['notes']), 10)
        self.assertEqual(resp.data['pagination']['total_count'], 25)
        self.assertEqual(resp.data['pagination']['total_pages'], 3)
        self.assertTrue(resp.data['pagination']['has_next'])

    def test_trash_list_search(self):
        from apps.notes.models import Note
        now = timezone.now()
        Note.objects.create(user=self.user, title='meeting notes', deleted_at=now)
        Note.objects.create(user=self.user, title='other stuff', deleted_at=now)

        resp = self.client.get('/api/notes/trash/?search=meeting')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['pagination']['total_count'], 1)
        self.assertEqual(resp.data['notes'][0]['title'], 'meeting notes')


class RetryExpiredNoteTest(TestCase):
    """H 수정 검증: retry_expired_note가 UNIQUE 위반 500 없이 기존 STT task를 재사용"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='retryuser',
            email='retry@example.com',
            password='testpass123!',
        )
        self.client.force_authenticate(user=self.user)

    def test_retry_reuses_task_row_without_unique_violation(self):
        """만료 노트에 기존 STT task가 있어도 재시도가 200이어야 하고(과거 500),
        노트는 pending으로, (note,'STT') 행은 하나로 유지되며 PENDING이어야 한다."""
        from django.urls import reverse
        from apps.notes.models import Note, ProcessingTask

        note = Note.objects.create(
            user=self.user, title='retry', processing_status='expired',
        )
        # (note, 'STT') 유니크 슬롯을 이미 점유하는 만료 task
        ProcessingTask.objects.create(
            note=note, task_type='STT', status='EXPIRED',
            expires_at=timezone.now(),
        )

        mock_result = type('R', (), {'id': str(uuid.uuid4())})()
        with patch('apps.notes.utils.get_worker_status', return_value={'status': 'ONLINE'}), \
             patch('celery.app.base.Celery.send_task', return_value=mock_result):
            response = self.client.post(reverse('notes:retry_expired_note', args=[note.id]))

        self.assertEqual(response.status_code, 200, response.content)
        note.refresh_from_db()
        self.assertEqual(note.processing_status, 'pending')

        tasks = ProcessingTask.objects.filter(note=note, task_type='STT')
        self.assertEqual(tasks.count(), 1, "유니크 제약상 (note,'STT') 행은 하나여야 한다.")
        self.assertEqual(tasks.first().status, 'PENDING')

    def test_retry_atomic_rolls_back_status_on_task_failure(self):
        """task 기록 단계가 실패하면 노트 상태가 롤백돼 계속 재시도 가능해야 한다(고착 방지)."""
        from django.urls import reverse
        from apps.notes.models import Note, ProcessingTask

        note = Note.objects.create(
            user=self.user, title='retry2', processing_status='expired',
        )
        # DRF가 처리하지 않는 일반 예외는 Django 테스트 클라이언트가 재발생시키므로
        # 여기서는 500 응답으로 받도록 하고 롤백 상태를 검증한다.
        self.client.raise_request_exception = False
        mock_result = type('R', (), {'id': str(uuid.uuid4())})()
        with patch('apps.notes.utils.get_worker_status', return_value={'status': 'ONLINE'}), \
             patch('celery.app.base.Celery.send_task', return_value=mock_result), \
             patch('apps.notes.models.ProcessingTask.objects.update_or_create',
                   side_effect=Exception('boom')):
            response = self.client.post(reverse('notes:retry_expired_note', args=[note.id]))

        self.assertEqual(response.status_code, 500)
        note.refresh_from_db()
        # atomic 롤백으로 여전히 expired → 재시도 가능(과거엔 pending으로 고착)
        self.assertEqual(note.processing_status, 'expired')


class EmptyTrashPartialFailureTest(TestCase):
    """휴지통 비우기 노트별 트랜잭션: 일부 실패 시 나머지는 삭제되고 207로 보고된다"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='trash_pf_user', email='trash_pf@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def test_partial_failure_deletes_rest_and_reports(self):
        from apps.notes.models import Note
        now = timezone.now()
        notes = [Note.objects.create(user=self.user, title=f't{i}', deleted_at=now) for i in range(3)]
        poison_id = notes[1].id

        original = Note.delete

        def flaky_delete(self, *args, **kwargs):
            if self.id == poison_id:
                raise RuntimeError('simulated delete failure')
            return original(self, *args, **kwargs)

        with patch.object(Note, 'delete', flaky_delete):
            r = self.client.delete('/api/notes/empty-trash/')

        # 구버전(단일 트랜잭션)은 전체 롤백으로 3개 모두 되살아났다
        self.assertEqual(r.status_code, 207)
        self.assertEqual(r.data['count'], 2)
        self.assertEqual(r.data['failed_count'], 1)
        remaining = list(Note.all_objects.filter(user=self.user).values_list('id', flat=True))
        self.assertEqual(remaining, [poison_id])


class NoteDetailRestoreCapTest(TestCase):
    """세그먼트 복원 건수 상한: 초과 시 행 생성 없이 content 폴백으로 응답한다"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='restore_user', email='restore@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def _make_note(self, n_segments):
        from apps.notes.models import Note
        segments = [
            {'idx': i + 1, 'start': float(i), 'end': float(i + 1), 'speaker': 'sp_0', 'text': f's{i}'}
            for i in range(n_segments)
        ]
        return Note.objects.create(user=self.user, title='r', content={'segments': segments})

    def test_over_cap_returns_fallback_without_writes(self):
        from apps.notes.models import NoteSegment
        note = self._make_note(15)
        with patch('apps.notes.views.MAX_RESTORE_SEGMENTS_PER_REQUEST', 10):
            r = self.client.get(f'/api/notes/{note.id}/')
        self.assertEqual(r.status_code, 200)
        # 응답에는 세그먼트가 있으나(폴백) DB 행은 생성되지 않아야 한다
        self.assertEqual(len(r.data['segments']), 15)
        self.assertEqual(NoteSegment.objects.filter(stt_id=note).count(), 0)

    def test_under_cap_restores_rows(self):
        from apps.notes.models import NoteSegment
        note = self._make_note(5)
        with patch('apps.notes.views.MAX_RESTORE_SEGMENTS_PER_REQUEST', 10):
            r = self.client.get(f'/api/notes/{note.id}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(NoteSegment.objects.filter(stt_id=note).count(), 5)


class TaskStatusErrorSanitizedTest(TestCase):
    """task_status가 워커 예외 원문(내부 엔드포인트·경로)을 노출하지 않는다"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='status_user', email='status@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def test_error_message_is_generic(self):
        from apps.notes.models import Note, ProcessingTask
        note = Note.objects.create(user=self.user, title='s', processing_status='failed')
        from datetime import timedelta
        ProcessingTask.objects.create(
            note=note, task_type='STT', status='FAILED',
            expires_at=timezone.now() + timedelta(hours=48),
            error_message='ConnectionError: http://minio.internal:9000/opennote/abc123.wav (/tmp/stt_x/model)',
        )
        r = self.client.get(f'/api/notes/{note.id}/status/')
        self.assertEqual(r.status_code, 200)
        body = str(r.data)
        self.assertNotIn('minio', body)
        self.assertNotIn('/tmp/', body)
        self.assertEqual(r.data['tasks'][0]['error_message'], '처리 중 오류가 발생했습니다. 다시 시도해주세요.')

    def test_no_error_stays_none(self):
        from apps.notes.models import Note, ProcessingTask
        note = Note.objects.create(user=self.user, title='s2', processing_status='completed')
        from datetime import timedelta
        ProcessingTask.objects.create(
            note=note, task_type='STT', status='SUCCESS',
            expires_at=timezone.now() + timedelta(hours=48),
        )
        r = self.client.get(f'/api/notes/{note.id}/status/')
        self.assertIsNone(r.data['tasks'][0]['error_message'])


class PlayAudioRangeStreamingTest(TestCase):
    """로컬 스토리지 Range 응답이 전체 적재 없이 스트리밍으로 내려간다"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='play_user', email='play@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def test_range_request_streams_exact_slice(self):
        import tempfile
        from django.test import override_settings
        from apps.notes.models import Note

        payload = MP3_HEADER + bytes(range(256)) * 4  # 식별 가능한 바이트 패턴
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                note = Note.objects.create(
                    user=self.user, title='p',
                    audio_file=SimpleUploadedFile('a.mp3', payload, content_type='audio/mpeg'),
                )
                r = self.client.get(f'/api/notes/{note.id}/play/', HTTP_RANGE='bytes=10-19')
                self.assertEqual(r.status_code, 206)
                # StreamingHttpResponse여야 한다 (구버전은 HttpResponse에 통째 적재)
                self.assertTrue(r.streaming)
                body = b"".join(r.streaming_content)
                self.assertEqual(body, payload[10:20])
                self.assertEqual(r['Content-Range'], f'bytes 10-19/{len(payload)}')


class NoteCreateOrphanCleanupTest(TestCase):
    """업로드 후 쿼터 거절/DB 실패 시 방금 올린 파일이 스토리지에 남지 않는다"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='orphan_user', email='orphan@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

    def _media_files(self, root):
        import os
        return [os.path.join(dp, f) for dp, _, fs in os.walk(root) for f in fs]

    def test_quota_rejection_cleans_uploaded_file(self):
        import tempfile
        from django.test import override_settings
        from apps.accounts.models import UserQuota

        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                with patch.object(UserQuota, 'can_upload_file', return_value=(False, '용량 초과')):
                    r = self.client.post('/api/notes/create/', {
                        'title': 't',
                        'audio_file': SimpleUploadedFile('a.mp3', MP3_HEADER, content_type='audio/mpeg'),
                    }, format='multipart')
                self.assertEqual(r.status_code, 413)
                # 업로드됐던 파일이 정리되어 스토리지가 비어 있어야 한다
                self.assertEqual(self._media_files(media_root), [])

    def test_db_failure_cleans_uploaded_file(self):
        import tempfile
        from django.test import override_settings
        from apps.accounts.models import UserQuota

        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                with patch.object(UserQuota, 'record_note_created', side_effect=RuntimeError('db down')):
                    r = self.client.post('/api/notes/create/', {
                        'title': 't',
                        'audio_file': SimpleUploadedFile('a.mp3', MP3_HEADER, content_type='audio/mpeg'),
                    }, format='multipart')
                self.assertEqual(r.status_code, 500)
                self.assertEqual(self._media_files(media_root), [])


class SampleNoteExternalDataTest(TestCase):
    """
    샘플 노트 콘텐츠는 저장소 밖(스토리지)의 JSON에서 읽는다.
    파일이 없거나 깨져도 가입 플로우를 막지 않고 샘플만 건너뛰어야 한다.
    픽스처는 실제 샘플이 아닌 합성 데이터다 — 외부 데이터셋 원문을 저장소에 넣지 않기 위함.
    """

    SYNTHETIC = {
        'note': {
            'title': '테스트 샘플',
            'preview': '안녕하세요.',
            'duration_seconds': 12.5,
            'speakers': {'sp_0': {'name': '참석자1'}, 'sp_1': {'name': '참석자2'}},
        },
        'summary': {'keywords': ['테스트'], 'main_topic': '합성 주제', 'next_actions': '없음'},
        'sections': [
            {'title': '도입', 'start_seconds': 0, 'end_seconds': 5, 'content': '인사', 'order': 0},
            {'title': '마무리', 'start_seconds': 5, 'end_seconds': 12.5, 'content': '종료', 'order': 1},
        ],
        'segments': [
            {'idx': 1, 'start': 0.0, 'end': 2.0, 'speaker': 'sp_0', 'text': '안녕하세요.'},
            {'idx': 2, 'start': 2.0, 'end': 4.5, 'speaker': 'sp_1', 'text': '반갑습니다.'},
            {'idx': 3, 'start': 4.5, 'end': 12.5, 'speaker': 'sp_0', 'text': '시작해볼게요.'},
        ],
    }

    def setUp(self):
        from apps.notes import sample_note
        self.module = sample_note
        sample_note._sample_data_cache = None
        self.addCleanup(setattr, sample_note, '_sample_data_cache', None)
        self.user = User.objects.create_user(
            username='sampleuser', email='sample@example.com', password='pass12345!'
        )

    def _storage_with(self, payload):
        """payload가 None이면 파일 없음, bytes면 그 내용을 돌려주는 스토리지 목."""
        import io
        from unittest.mock import MagicMock

        storage = MagicMock()
        if payload is None:
            storage.open.side_effect = FileNotFoundError
        else:
            storage.open.side_effect = lambda *a, **k: io.BytesIO(payload)
        return storage

    def _json(self, data):
        import json
        return json.dumps(data, ensure_ascii=False).encode('utf-8')

    def _create(self, storage):
        with patch.object(self.module, 'default_storage', storage):
            return self.module.create_sample_note_if_needed(self.user)

    def test_데이터_파일이_없으면_샘플을_건너뛴다(self):
        from apps.notes.models import Note
        self.assertFalse(self._create(self._storage_with(None)))
        self.assertFalse(Note.all_objects.filter(user=self.user, is_sample=True).exists())

    def test_데이터_파일이_있으면_샘플_노트를_만든다(self):
        from datetime import timedelta
        from apps.notes.models import Note, NoteSegment

        self.assertTrue(self._create(self._storage_with(self._json(self.SYNTHETIC))))

        note = Note.all_objects.get(user=self.user, is_sample=True)
        self.assertEqual(note.title, '테스트 샘플')
        self.assertEqual(note.duration, timedelta(seconds=12.5))
        self.assertEqual(note.processing_status, 'completed')
        self.assertEqual(note.audio_file.name, self.module.SAMPLE_AUDIO_PATH)
        self.assertEqual(NoteSegment.objects.filter(stt_id=note).count(), 3)
        self.assertEqual(note.summary.sections.count(), 2)
        self.assertEqual(len(note.content['segments']), 3)
        self.assertEqual(note.content['segments'][0]['words'], [])

    def test_두번_호출해도_하나만_생긴다(self):
        from apps.notes.models import Note
        storage = self._storage_with(self._json(self.SYNTHETIC))
        self.assertTrue(self._create(storage))
        self.assertFalse(self._create(storage))
        self.assertEqual(Note.all_objects.filter(user=self.user, is_sample=True).count(), 1)

    def test_형식이_깨진_데이터는_건너뛴다(self):
        from apps.notes.models import Note
        broken = self._json({'note': {'title': '필드 누락'}})
        self.assertFalse(self._create(self._storage_with(broken)))
        self.assertFalse(Note.all_objects.filter(user=self.user, is_sample=True).exists())

    def test_실패는_캐시하지_않아_파일을_올리면_바로_반영된다(self):
        """운영 중 파일을 나중에 올려도 재기동 없이 다음 가입부터 샘플이 생겨야 한다."""
        self.assertFalse(self._create(self._storage_with(None)))
        self.assertTrue(self._create(self._storage_with(self._json(self.SYNTHETIC))))
