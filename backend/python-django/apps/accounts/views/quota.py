"""
쿼터 관련 API 뷰
"""
from datetime import timedelta
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..utils.formatting import format_bytes


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_quota_info(request):
    """현재 사용자의 쿼터 정보 조회"""
    from ..models import UserQuota

    quota = UserQuota.get_or_create_for_user(request.user)
    quota.check_daily_reset()

    # 다음 리셋 시간 계산 (KST 자정)
    next_reset = quota.daily_reset_date + timedelta(days=1)
    remaining_bytes = max(0, quota.storage_limit_bytes - quota.storage_used_bytes)

    return Response({
        'plan': quota.plan_type,
        'plan_display': quota.get_plan_type_display(),
        'daily': {
            'limit': quota.daily_note_limit,
            'used': quota.daily_notes_created,
            'remaining': quota.get_daily_remaining(),
            'reset_date': str(next_reset),
            'reset_at': f"{next_reset}T00:00:00+09:00"
        },
        'storage': {
            'limit_bytes': quota.storage_limit_bytes,
            'used_bytes': quota.storage_used_bytes,
            'remaining_bytes': remaining_bytes,
            'usage_percent': quota.get_storage_usage_percent(),
            # 적응형 단위 포맷팅 (일관된 표시)
            'limit_display': format_bytes(quota.storage_limit_bytes),
            'used_display': format_bytes(quota.storage_used_bytes),
            'remaining_display': format_bytes(remaining_bytes)
        }
    })
