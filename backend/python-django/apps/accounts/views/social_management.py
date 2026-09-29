"""
소셜 계정 연결/해제 관련 뷰

dj-rest-auth + allauth 기반으로 리팩토링됨.
allauth.socialaccount.SocialAccount를 사용합니다.
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.db import transaction

from allauth.socialaccount.models import SocialAccount
from ..models import AccountLinkingToken
from ..constants import MERGE_TOKEN_COOKIE
from ..serializers import (
    UnlinkSocialAccountRequestSerializer, SetPasswordSerializer,
    MergeAccountsSerializer
)
from ..throttles import (
    SocialUnlinkThrottle,
    AccountMergeThrottle, SetPasswordThrottle
)
from ..services.social_linking import merge_accounts

User = get_user_model()
logger = logging.getLogger(__name__)


class LinkedAccountsView(APIView):
    """연결된 소셜 계정 목록 조회 (allauth SocialAccount 사용)"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        # allauth SocialAccount 사용 (date_joined으로 정렬)
        # select_related로 metadata를 미리 로드하여 N+1 쿼리 방지
        linked_accounts = SocialAccount.objects.filter(user=user).select_related('metadata').order_by('-date_joined')

        # 사용 가능한 모든 제공자
        all_providers = [
            {'name': 'github', 'display': 'GitHub'},
            {'name': 'google', 'display': 'Google'},
            {'name': 'naver', 'display': 'Naver'},
            {'name': 'kakao', 'display': 'Kakao'},
        ]

        linked_provider_names = user.get_linked_providers()

        # 프론트엔드가 기대하는 필드명으로 변환: 'provider', 'provider_display'
        available_providers = [
            {
                'provider': p['name'],
                'provider_display': p['display'],
                'is_linked': p['name'] in linked_provider_names
            }
            for p in all_providers
        ]

        # allauth SocialAccount를 LinkedAccountSerializer에 맞게 변환
        linked_accounts_data = []
        linked_count = len(linked_provider_names)
        has_password = user.has_usable_password()

        for account in linked_accounts:
            # 메타데이터 가져오기 (없으면 기본값 사용)
            metadata = getattr(account, 'metadata', None)

            # 연결 해제 가능 여부: 비밀번호가 있거나 다른 소셜 계정이 있을 때
            can_unlink = has_password or linked_count > 1

            linked_accounts_data.append({
                'provider': account.provider,
                'provider_display': self._get_provider_display(account.provider),
                'social_email': account.extra_data.get('email', ''),
                'social_name': account.extra_data.get('name', '') or account.extra_data.get('login', ''),
                'linked_at': account.date_joined.isoformat(),
                'linked_by': metadata.linked_by if metadata else 'registration',
                'access_count': metadata.access_count if metadata else 0,
                'last_used_at': metadata.last_used_at.isoformat() if metadata and metadata.last_used_at else None,
                'can_unlink': can_unlink,
            })

        return Response({
            'linked_accounts': linked_accounts_data,
            'available_providers': available_providers,
            'has_password': user.has_usable_password(),
            'can_set_password': not user.has_usable_password() and SocialAccount.objects.filter(user=user).exists(),
            'total_linked': len(linked_provider_names),
            'can_add_more': len(linked_provider_names) < len(all_providers)
        })

    def _get_provider_display(self, provider):
        """프로바이더 표시명 반환"""
        display_names = {
            'github': 'GitHub',
            'google': 'Google',
            'naver': 'Naver',
            'kakao': 'Kakao',
        }
        return display_names.get(provider, provider.capitalize())


class UnlinkSocialAccountView(APIView):
    """소셜 계정 연결 해제 (allauth SocialAccount 사용)"""
    permission_classes = [IsAuthenticated]
    throttle_classes = [SocialUnlinkThrottle]

    def delete(self, request, provider):
        user = request.user

        # 지원하는 프로바이더 검증
        if provider not in ['github', 'google', 'naver', 'kakao']:
            return Response({
                'detail': '지원하지 않는 소셜 서비스입니다.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Serializer로 검증
        serializer = UnlinkSocialAccountRequestSerializer(
            data=request.data,
            context={'user': user, 'provider': provider}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # allauth SocialAccount 찾기
        try:
            social_account = SocialAccount.objects.get(user=user, provider=provider)
        except SocialAccount.DoesNotExist:
            return Response({
                'detail': f'{provider.capitalize()} 계정이 연결되어 있지 않습니다.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 연결 해제 - allauth SocialAccount 삭제 (메타데이터도 CASCADE로 삭제됨)
        social_account.delete()

        # 남은 소셜 계정 확인 후 is_social_user 플래그 업데이트
        remaining_providers = user.get_linked_providers()
        if not remaining_providers:
            user.is_social_user = False
            user.save(update_fields=['is_social_user'])

        logger.info(f"Social account unlinked: {user.username} - {provider}")

        return Response({
            'message': f'{provider.capitalize()} 계정 연결이 해제되었습니다.',
            'remaining_providers': remaining_providers
        })


class SetPasswordView(APIView):
    """비밀번호 설정 (소셜 전용 사용자용)"""
    permission_classes = [IsAuthenticated]
    throttle_classes = [SetPasswordThrottle]

    def post(self, request):
        user = request.user

        # 이미 비밀번호가 있는 경우
        if user.has_usable_password():
            return Response({
                'detail': '이미 비밀번호가 설정되어 있습니다. 비밀번호 변경 기능을 사용하세요.'
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer = SetPasswordSerializer(
            data=request.data,
            context={'user': user}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # 소셜 인증 토큰 검증 (소셜 전용 사용자의 경우)
        if user.is_social_user:
            verification_token = serializer.validated_data.get('social_verification_token')
            if verification_token:
                try:
                    token_obj = AccountLinkingToken.objects.get(
                        token=verification_token,
                        user=user,
                        link_type='set_password',
                        status='pending'
                    )
                    if not token_obj.is_valid():
                        return Response({
                            'detail': '인증 토큰이 만료되었습니다. 다시 인증해주세요.'
                        }, status=status.HTTP_400_BAD_REQUEST)
                    token_obj.complete()
                except AccountLinkingToken.DoesNotExist:
                    return Response({
                        'detail': '유효하지 않은 인증 토큰입니다.'
                    }, status=status.HTTP_400_BAD_REQUEST)

        # 비밀번호 설정
        new_password = serializer.validated_data['new_password']
        user.set_password(new_password)
        user.save()

        logger.info(f"Password set for social user: {user.username}")

        return Response({
            'message': '비밀번호가 성공적으로 설정되었습니다. 이제 이메일과 비밀번호로 로그인할 수 있습니다.'
        })


class MergeAccountsView(APIView):
    """계정 병합"""
    permission_classes = [IsAuthenticated]
    throttle_classes = [AccountMergeThrottle]

    def post(self, request):
        serializer = MergeAccountsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # 병합 토큰을 HttpOnly 쿠키로만 받는다(URL·바디 노출 제거).
        token = request.COOKIES.get(MERGE_TOKEN_COOKIE)
        if not token:
            return Response({
                'detail': '병합 토큰이 없습니다.'
            }, status=status.HTTP_400_BAD_REQUEST)
        target_password = serializer.validated_data.get('target_password')

        try:
            merge_token = AccountLinkingToken.objects.get(
                token=token,
                link_type='merge_accounts',
                status='pending'
            )
        except AccountLinkingToken.DoesNotExist:
            return Response({
                'detail': '유효하지 않은 병합 토큰입니다.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not merge_token.is_valid():
            return Response({
                'detail': '병합 토큰이 만료되었습니다.'
            }, status=status.HTTP_400_BAD_REQUEST)

        target_user = merge_token.user
        source_user = merge_token.source_user

        # 병합을 확정하는 세션이 토큰의 target(흡수하는 계정) 본인인지 강제한다.
        # 기존엔 토큰을 값으로만 조회해, 토큰이 URL 노출 등으로 유출되면 제3자가
        # 로그인만 돼 있으면 남의 병합을 강제 실행(source 삭제)할 수 있었다.
        # request.user는 JWT 서명으로 위조 불가하므로 토큰 유출만으로는 실행되지 않는다.
        if merge_token.user_id != request.user.id:
            return Response({
                'detail': '이 병합 요청에 대한 권한이 없습니다.'
            }, status=status.HTTP_403_FORBIDDEN)

        if not source_user:
            return Response({
                'detail': '병합할 소스 계정을 찾을 수 없습니다.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 대상 계정 비밀번호 검증
        if target_user.has_usable_password():
            if not target_password:
                return Response({
                    'detail': '대상 계정의 비밀번호 확인이 필요합니다.'
                }, status=status.HTTP_400_BAD_REQUEST)
            if not target_user.check_password(target_password):
                return Response({
                    'detail': '비밀번호가 올바르지 않습니다.'
                }, status=status.HTTP_400_BAD_REQUEST)

        # L14: 토큰 완료 처리와 병합을 한 트랜잭션으로 묶는다. 과거엔 complete()를
        # 병합 앞에서 먼저 커밋해, 병합이 실패(500)하면 토큰이 이미 소진돼 재시도가
        # 불가능했다. 함께 묶으면 실패 시 롤백돼 토큰이 pending으로 남아 재시도할 수 있다.
        # (complete()는 merge_accounts 내부의 source_user.delete() 전에 실행돼야 하므로
        # 순서는 그대로 유지한다.)
        source_user_info = f"{source_user.username} (id={source_user.id})"
        try:
            with transaction.atomic():
                merge_token.complete()
                # 계정 병합 (소셜 계정, 노트, 폴더, 라벨 모두 이전, source_user 삭제)
                stats = merge_accounts(target_user, source_user)
        except Exception as e:
            logger.error(f"Error merging accounts: {str(e)}")
            return Response({
                'detail': '계정 병합 중 오류가 발생했습니다.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        logger.info(f"Accounts merged: {source_user_info} -> {target_user.username}. Stats: {stats}")

        merge_response = Response({
            'message': '계정이 성공적으로 병합되었습니다.',
            'merged_providers': target_user.get_linked_providers(),
            'stats': stats
        })
        # 사용 완료된 병합 토큰 쿠키 제거
        merge_response.delete_cookie(MERGE_TOKEN_COOKIE, path='/')
        return merge_response
