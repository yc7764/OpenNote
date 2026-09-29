from django.urls import path
from . import views

app_name = 'notes'

urlpatterns = [
    # 기본 노트 CRUD
    path('api/notes/', views.note_list, name='note_list'),
    path('api/notes/create/', views.note_create, name='note_create'),
    path('api/notes/<int:note_id>/', views.note_detail, name='note_detail'),
    path('api/notes/<int:note_id>/delete/', views.note_delete, name='note_delete'),
    path('api/notes/delete-multiple/', views.note_delete_multiple, name='note_delete_multiple'),
    path('api/notes/<int:note_id>/play/', views.play_audio, name='play_audio'),

    # 즐겨찾기
    path('api/notes/<int:note_id>/favorite/', views.toggle_favorite, name='toggle_favorite'),

    # 휴지통
    path('api/notes/trash/', views.trash_list, name='trash_list'),
    path('api/notes/<int:note_id>/restore/', views.restore_note, name='restore_note'),
    path('api/notes/<int:note_id>/permanent-delete/', views.permanent_delete, name='permanent_delete'),
    path('api/notes/empty-trash/', views.empty_trash, name='empty_trash'),

    # 처리 상태
    path('api/notes/<int:note_id>/retry/', views.retry_expired_note, name='retry_expired_note'),
    path('api/notes/<int:note_id>/status/', views.task_status, name='task_status'),
] 