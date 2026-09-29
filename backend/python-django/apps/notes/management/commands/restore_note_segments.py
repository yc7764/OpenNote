"""
notes_note.content에서 NoteSegment 행을 일괄 복원하는 관리 커맨드.

파티션 삭제로 세그먼트 행이 사라진 노트는 상세 GET이 요청 경로에서 소량
(MAX_RESTORE_SEGMENTS_PER_REQUEST 이하)만 즉시 복원한다. 상한을 넘는 노트나
대량 복원은 운영자가 이 커맨드로 의도적으로 실행한다.

사용법:
    manage.py restore_note_segments            # 대상 전체 복원
    manage.py restore_note_segments --note-id 123
    manage.py restore_note_segments --dry-run  # 대상만 출력
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.notes.models import Note, NoteSegment


class Command(BaseCommand):
    help = "세그먼트 행이 없는 노트를 note.content에서 일괄 복원한다"

    def add_arguments(self, parser):
        parser.add_argument('--note-id', type=int, help='특정 노트만 복원')
        parser.add_argument('--dry-run', action='store_true', help='복원 대상만 출력')

    def handle(self, *args, **options):
        qs = Note.objects.filter(segments__isnull=True).distinct()
        if options['note_id']:
            qs = qs.filter(id=options['note_id'])

        restored = skipped = failed = 0
        for note in qs.iterator():
            raw_segments = (note.content or {}).get('segments') if isinstance(note.content, dict) else None
            if not raw_segments or not isinstance(raw_segments, list):
                skipped += 1
                continue

            if options['dry_run']:
                self.stdout.write(f"note {note.id}: {len(raw_segments)} segments 복원 대상")
                restored += 1
                continue

            try:
                with transaction.atomic():
                    locked = Note.objects.select_for_update().get(id=note.id)
                    if locked.segments.exists():
                        skipped += 1
                        continue
                    NoteSegment.objects.bulk_create(
                        [
                            NoteSegment(
                                stt_id=locked,
                                idx=int(seg.get('idx', i + 1)),
                                start=float(seg.get('start', 0.0)),
                                end=float(seg.get('end', 0.0)),
                                speaker=str(seg.get('speaker', '')),
                                text=str(seg.get('text', '')),
                                words=seg.get('words') or [],
                            )
                            for i, seg in enumerate(raw_segments)
                        ],
                        batch_size=1000,
                    )
                restored += 1
                self.stdout.write(f"note {note.id}: {len(raw_segments)} segments 복원 완료")
            except Exception as exc:
                failed += 1
                self.stderr.write(f"note {note.id}: 복원 실패 — {exc}")

        self.stdout.write(self.style.SUCCESS(
            f"완료 — 복원 {restored} · 건너뜀 {skipped} · 실패 {failed}"
            + (" (dry-run)" if options['dry_run'] else "")
        ))
