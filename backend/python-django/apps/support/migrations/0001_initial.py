# Generated migration for support app

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='FAQ',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(choices=[('usage', '사용방법'), ('account', '계정'), ('technical', '기술'), ('other', '기타')], default='usage', max_length=50, verbose_name='카테고리')),
                ('question', models.CharField(max_length=500, verbose_name='질문')),
                ('answer', models.TextField(verbose_name='답변')),
                ('order', models.PositiveIntegerField(default=0, verbose_name='정렬 순서')),
                ('is_active', models.BooleanField(default=True, verbose_name='활성화')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='생성일')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='수정일')),
            ],
            options={
                'verbose_name': '자주 묻는 질문',
                'verbose_name_plural': '자주 묻는 질문',
                'ordering': ['category', 'order', 'created_at'],
            },
        ),
        migrations.CreateModel(
            name='ContactInquiry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, verbose_name='이름')),
                ('email', models.EmailField(max_length=254, verbose_name='이메일')),
                ('subject', models.CharField(max_length=200, verbose_name='제목')),
                ('message', models.TextField(verbose_name='내용')),
                ('is_read', models.BooleanField(default=False, verbose_name='읽음')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='접수일')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='inquiries', to=settings.AUTH_USER_MODEL, verbose_name='사용자')),
            ],
            options={
                'verbose_name': '문의',
                'verbose_name_plural': '문의',
                'ordering': ['-created_at'],
            },
        ),
    ]
