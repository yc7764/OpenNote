"""
사용자 프로필 관련 뷰
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model

from apps.common.logging_utils import log_auth_event

logger = logging.getLogger(__name__)
User = get_user_model()


class UserProfileView(APIView):
    """
    사용자 프로필 정보 조회 및 수정 API
    """

    def get(self, request, *args, **kwargs):
        """사용자 프로필 정보 조회"""
        try:
            user = request.user
            return Response({
                'pk': user.id,
                'id': user.id,  # 호환성을 위해 둘 다 제공
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'date_joined': user.date_joined.isoformat() if getattr(user, 'date_joined', None) else None,
                'last_login': user.last_login.isoformat() if getattr(user, 'last_login', None) else None,
                'is_active': user.is_active,
                # Master Account 시스템 필드
                'has_password': user.has_usable_password(),
                'is_social_user': getattr(user, 'is_social_user', False),
                'primary_auth_method': getattr(user, 'primary_auth_method', 'email'),
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception(f"Failed to get profile for user {request.user.id}")
            return Response(
                {'detail': '사용자 정보를 불러오는 중 오류가 발생했습니다.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def put(self, request, *args, **kwargs):
        """사용자 프로필 정보 수정"""
        try:
            user = request.user
            data = request.data

            # 수정 가능한 필드들 (email 변경은 별도 플로우)
            # 프론트엔드에서 camelCase(firstName, lastName)를 보낼 수 있으므로 매핑 처리
            field_map = {
                'username': 'username',
                'first_name': 'first_name',
                'last_name': 'last_name',
                'firstName': 'first_name',
                'lastName': 'last_name',
            }

            for incoming_key, model_field in field_map.items():
                if incoming_key in data:
                    value = data.get(incoming_key)
                    # 공백 문자열로 덮어쓰지 않도록 방지 (명시적으로 빈 값으로 초기화하려면 별도 API 사용 권장)
                    if isinstance(value, str):
                        value = value.strip()
                    if value not in (None, ''):
                        setattr(user, model_field, value)

            # 사용자명 형식·중복 검사
            username_candidate = data.get('username')
            if username_candidate:
                username_candidate = username_candidate.strip()
                # 이메일 형식 username은 로그인 시 '@' 분기(이메일/username 조회)를
                # 교란하므로 거부한다.
                if '@' in username_candidate:
                    return Response(
                        {'username': ['사용자명에는 @를 포함할 수 없습니다.']},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                if User.objects.filter(username=username_candidate).exclude(id=user.id).exists():
                    return Response(
                        {'username': ['이미 사용 중인 사용자명입니다.']},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # 이메일 변경은 별도 인증 플로우로 처리
            if 'email' in data and data['email'] != user.email:
                return Response(
                    {'email': ['이메일 변경은 별도 인증이 필요합니다. 이메일 변경 요청 기능을 사용해주세요.']},
                    status=status.HTTP_400_BAD_REQUEST
                )

            user.save()

            # GET 스키마와 동일하게 반환하여 프론트 setProfile(data)와 일치시킴
            return Response({
                'pk': user.id,
                'id': user.id,  # 호환성을 위해 둘 다 제공
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'date_joined': user.date_joined,
                'last_login': user.last_login,
                'is_active': user.is_active,
                # Master Account 시스템 필드
                'has_password': user.has_usable_password(),
                'is_social_user': getattr(user, 'is_social_user', False),
                'primary_auth_method': getattr(user, 'primary_auth_method', 'email'),
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception(f"Failed to update profile for user {request.user.id}")
            return Response(
                {'detail': '프로필 업데이트 중 오류가 발생했습니다.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DeleteAccountView(APIView):
    """
    회원 탈퇴 API
    """

    def post(self, request, *args, **kwargs):
        try:
            user = request.user
            password = request.data.get('password')

            # 소셜 전용 계정(비밀번호 없음)은 check_password가 항상 실패해
            # 탈퇴가 원천 봉쇄됐다(UX 버그). 이미 JWT로 인증된 요청이므로,
            # 비밀번호가 없는 계정은 비밀번호 재확인 단계를 건너뛴다.
            if user.has_usable_password():
                if not password:
                    return Response(
                        {'detail': '비밀번호를 입력해주세요.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                if not user.check_password(password):
                    return Response(
                        {'password': ['비밀번호가 올바르지 않습니다.']},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # 비즈니스 로깅: 계정 삭제 (삭제 전에 로깅)
            user_id = user.id
            user_email = user.email
            log_auth_event(logger, 'account_deleted', request, success=True,
                          user=user, email=user_email)

            # 사용자 삭제
            user.delete()

            return Response({
                'detail': '회원 탈퇴가 완료되었습니다.'
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception(f"Failed to delete account for user {request.user.id}")
            return Response(
                {'detail': '회원 탈퇴 중 오류가 발생했습니다.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
