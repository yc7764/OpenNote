# Generated manually for Celery + RabbitMQ integration

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('notes', '0005_alter_note_title'),
    ]

    operations = [
        # Create ProcessingTask model
        migrations.CreateModel(
            name='ProcessingTask',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('task_type', models.CharField(choices=[('STT', 'STT 처리'), ('SUMMARY', '요약 처리')], max_length=20)),
                ('celery_task_id', models.UUIDField(blank=True, db_index=True, null=True)),
                ('status', models.CharField(
                    choices=[
                        ('PENDING', '대기 중'),
                        ('PROCESSING', '처리 중'),
                        ('SUCCESS', '성공'),
                        ('FAILED', '실패'),
                        ('RETRY', '재시도'),
                        ('EXPIRED', '만료'),
                        ('CANCELLED', '취소')
                    ],
                    db_index=True,
                    default='PENDING',
                    max_length=20
                )),
                ('attempt_count', models.IntegerField(default=0)),
                ('max_retries', models.IntegerField(default=3)),
                ('error_message', models.TextField(blank=True, null=True)),
                ('error_history', models.JSONField(blank=True, default=list)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField(help_text='48시간 후 자동 만료')),
                ('note', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='processing_tasks',
                    to='notes.note'
                )),
            ],
            options={
                'db_table': 'smartnote_processingtask',
                'ordering': ['-created_at'],
            },
        ),

        # Create WorkerHeartbeat model
        migrations.CreateModel(
            name='WorkerHeartbeat',
            fields=[
                ('worker_id', models.CharField(max_length=100, primary_key=True, serialize=False, unique=True)),
                ('worker_type', models.CharField(
                    choices=[('STT', 'STT 워커'), ('SUMMARY', '요약 워커')],
                    max_length=20
                )),
                ('hostname', models.CharField(max_length=255)),
                ('status', models.CharField(
                    choices=[
                        ('ONLINE', '온라인'),
                        ('OFFLINE', '오프라인'),
                        ('DEGRADED', '성능 저하')
                    ],
                    default='ONLINE',
                    max_length=20
                )),
                ('last_heartbeat', models.DateTimeField(auto_now=True, db_index=True)),
                ('gpu_utilization', models.FloatField(blank=True, help_text='GPU 사용률 (%)', null=True)),
                ('memory_usage', models.FloatField(blank=True, help_text='메모리 사용률 (%)', null=True)),
                ('queue_depth', models.IntegerField(default=0)),
                ('processed_count_24h', models.IntegerField(default=0)),
                ('avg_processing_time', models.FloatField(blank=True, help_text='평균 처리 시간 (초)', null=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'smartnote_workerheartbeat',
            },
        ),

        # Update Note model - add new processing status choices
        migrations.AlterField(
            model_name='note',
            name='processing_status',
            field=models.CharField(
                choices=[
                    ('uploaded', '업로드 완료'),
                    ('pending', '처리 대기 중'),
                    ('processing', '음성 인식 중'),
                    ('summarizing', '내용 요약 중'),
                    ('completed', '처리 완료'),
                    ('failed', '처리 실패'),
                    ('expired', '처리 만료'),
                ],
                default='processing',
                max_length=20
            ),
        ),

        # Add new fields to Note model
        migrations.AddField(
            model_name='note',
            name='processing_started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='note',
            name='processing_completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='note',
            name='error_details',
            field=models.JSONField(blank=True, null=True),
        ),

        # Add indexes for ProcessingTask
        migrations.AddIndex(
            model_name='processingtask',
            index=models.Index(fields=['status', 'created_at'], name='idx_task_status_created'),
        ),
        migrations.AddIndex(
            model_name='processingtask',
            index=models.Index(fields=['note', 'task_type'], name='idx_task_note_type'),
        ),
        migrations.AddIndex(
            model_name='processingtask',
            index=models.Index(fields=['celery_task_id'], name='idx_task_celery_id'),
        ),

        # Add indexes for WorkerHeartbeat
        migrations.AddIndex(
            model_name='workerheartbeat',
            index=models.Index(fields=['status', 'last_heartbeat'], name='idx_worker_status_hb'),
        ),
        migrations.AddIndex(
            model_name='workerheartbeat',
            index=models.Index(fields=['worker_type', 'status'], name='idx_worker_type_status'),
        ),
    ]
