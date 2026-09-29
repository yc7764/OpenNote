# Generated manually for social login master account feature
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_create_user_quotas'),
    ]

    operations = [
        # === User 모델 확장 ===
        migrations.AddField(
            model_name='user',
            name='has_usable_password',
            field=models.BooleanField(default=True, verbose_name='비밀번호 사용 가능'),
        ),
        migrations.AddField(
            model_name='user',
            name='primary_auth_method',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('email', 'Email/Password'),
                    ('github', 'GitHub'),
                    ('google', 'Google'),
                    ('naver', 'Naver'),
                    ('kakao', 'Kakao'),
                ],
                default='email',
                verbose_name='기본 인증 방식'
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='email_verified',
            field=models.BooleanField(default=False, verbose_name='이메일 인증 완료'),
        ),
        migrations.AddField(
            model_name='user',
            name='email_verified_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='이메일 인증 완료 시간'),
        ),
        migrations.AddField(
            model_name='user',
            name='created_via',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('registration', 'Email Registration'),
                    ('social_github', 'GitHub OAuth'),
                    ('social_google', 'Google OAuth'),
                    ('social_naver', 'Naver OAuth'),
                    ('social_kakao', 'Kakao OAuth'),
                ],
                default='registration',
                verbose_name='계정 생성 경로'
            ),
        ),

        # === SocialAccount 모델 확장 ===
        migrations.AddField(
            model_name='socialaccount',
            name='linked_by',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('registration', '계정 생성 시'),
                    ('auto_email', '이메일 자동 연결'),
                    ('manual', '수동 연결'),
                ],
                default='registration',
                verbose_name='연결 방식'
            ),
        ),
        migrations.AddField(
            model_name='socialaccount',
            name='linked_at',
            field=models.DateTimeField(auto_now_add=True, verbose_name='연결 일시', null=True),
        ),
        migrations.AddField(
            model_name='socialaccount',
            name='last_used_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='마지막 사용 일시'),
        ),
        migrations.AddField(
            model_name='socialaccount',
            name='access_count',
            field=models.PositiveIntegerField(default=0, verbose_name='접근 횟수'),
        ),

        # SocialAccount Meta 업데이트
        migrations.AlterModelOptions(
            name='socialaccount',
            options={'verbose_name': '소셜 계정', 'verbose_name_plural': '소셜 계정'},
        ),

        # === AccountLinkingToken 모델 생성 ===
        migrations.CreateModel(
            name='AccountLinkingToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.UUIDField(default=uuid.uuid4, unique=True)),
                ('link_type', models.CharField(
                    max_length=20,
                    choices=[
                        ('link_social', '소셜 계정 연결'),
                        ('merge_accounts', '계정 병합'),
                        ('set_password', '비밀번호 설정'),
                    ],
                    verbose_name='연결 유형'
                )),
                ('status', models.CharField(
                    max_length=20,
                    choices=[
                        ('pending', '대기 중'),
                        ('completed', '완료'),
                        ('expired', '만료'),
                        ('cancelled', '취소'),
                    ],
                    default='pending',
                    verbose_name='상태'
                )),
                ('provider', models.CharField(max_length=20, verbose_name='소셜 제공자')),
                ('social_id', models.CharField(max_length=255, verbose_name='소셜 ID')),
                ('social_email', models.EmailField(blank=True, max_length=254, null=True, verbose_name='소셜 이메일')),
                ('social_name', models.CharField(blank=True, max_length=255, null=True, verbose_name='소셜 이름')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(verbose_name='만료 시간')),
                ('completed_at', models.DateTimeField(blank=True, null=True, verbose_name='완료 시간')),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True, verbose_name='IP 주소')),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='linking_tokens',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='대상 사용자'
                )),
                ('source_user', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='merge_source_tokens',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='소스 사용자 (병합용)'
                )),
            ],
            options={
                'verbose_name': '계정 연결 토큰',
                'verbose_name_plural': '계정 연결 토큰',
            },
        ),

        # AccountLinkingToken 인덱스 추가
        migrations.AddIndex(
            model_name='accountlinkingtoken',
            index=models.Index(fields=['token'], name='accounts_ac_token_9d4e8c_idx'),
        ),
        migrations.AddIndex(
            model_name='accountlinkingtoken',
            index=models.Index(fields=['user', 'status'], name='accounts_ac_user_id_b2f3d1_idx'),
        ),
        migrations.AddIndex(
            model_name='accountlinkingtoken',
            index=models.Index(fields=['expires_at'], name='accounts_ac_expires_7c8f2a_idx'),
        ),
    ]
