# Generated migration for adding UNIQUE constraint to ProcessingTask

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notes', '0009_add_idx_to_existing_segments'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='processingtask',
            constraint=models.UniqueConstraint(
                fields=['note', 'task_type'],
                name='unique_note_task_type'
            ),
        ),
    ]
