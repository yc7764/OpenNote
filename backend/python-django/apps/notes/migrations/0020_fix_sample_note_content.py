"""
기존 샘플 노트의 content 필드 수정

- content가 비어있는 샘플 노트에 NoteSegment 기반 content JSON 생성
- 이미 올바른 데이터를 가진 노트는 건드리지 않음
"""
from django.db import migrations


def fix_sample_notes(apps, schema_editor):
    """기존 샘플 노트의 content 필드 수정"""
    Note = apps.get_model('notes', 'Note')
    NoteSegment = apps.get_model('notes', 'NoteSegment')

    sample_notes = Note.objects.filter(is_sample=True)
    fixed_count = 0

    for note in sample_notes:
        # content가 비어있으면 세그먼트 기반으로 생성
        if not note.content or note.content == {}:
            segments = NoteSegment.objects.filter(stt_id=note).order_by('idx')
            note.content = {
                'segments': [
                    {
                        'idx': seg.idx,
                        'start': seg.start,
                        'end': seg.end,
                        'speaker': seg.speaker,
                        'text': seg.text,
                        'words': [],
                    }
                    for seg in segments
                ],
                'word_segments': [],
            }
            note.save(update_fields=['content'])
            fixed_count += 1

    if fixed_count:
        print(f'\n  ✅ {fixed_count}개 샘플 노트 content 수정 완료')
    else:
        print('\n  ✅ 수정할 샘플 노트 없음')


class Migration(migrations.Migration):

    dependencies = [
        ('notes', '0019_fix_sample_note_constraint'),
    ]

    operations = [
        migrations.RunPython(
            fix_sample_notes,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
