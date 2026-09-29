from django.apps import AppConfig


class NotesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.notes'

    def ready(self):
        import apps.notes.signals  # noqa: F401 - 시그널 핸들러 등록
