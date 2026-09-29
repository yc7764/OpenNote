"""
알림 API URL 라우팅
"""
from django.urls import path
from . import views

app_name = 'notifications'

urlpatterns = [
    # 알림 목록 조회
    path('', views.NotificationListView.as_view(), name='list'),

    # 읽지 않은 알림 수 조회
    path('unread-count/', views.UnreadCountView.as_view(), name='unread-count'),

    # 모든 알림 읽음 처리
    path('read-all/', views.NotificationReadAllView.as_view(), name='read-all'),

    # 단일 알림 읽음 처리
    path('<uuid:pk>/read/', views.NotificationReadView.as_view(), name='read'),
]
