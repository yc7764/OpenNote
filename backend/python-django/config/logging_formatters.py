# config/logging_formatters.py
"""
커스텀 로깅 포맷터

pythonjsonlogger의 rename_fields 이슈를 해결하고
Gunicorn access 로그 등 다양한 로그 레코드를 안전하게 처리합니다.
"""

from pythonjsonlogger.jsonlogger import JsonFormatter


class SafeJsonFormatter(JsonFormatter):
    """
    필드가 없어도 안전하게 처리하는 JSON 포맷터

    pythonjsonlogger의 rename_fields가 존재하지 않는 필드를
    rename하려고 할 때 KeyError가 발생하는 문제를 해결합니다.
    """

    def _perform_rename_log_fields(self, log_record):
        """
        필드 이름 변경 시 존재하지 않는 필드는 건너뛰기
        """
        if self.rename_fields:
            for old_field_name, new_field_name in self.rename_fields.items():
                if old_field_name in log_record:
                    log_record[new_field_name] = log_record.pop(old_field_name)

    def add_fields(self, log_record, record, message_dict):
        """
        로그 레코드에 필드 추가 시 안전하게 처리
        """
        # levelname을 먼저 추가해서 rename_fields가 제대로 작동하도록 함
        if hasattr(record, 'levelname') and record.levelname:
            log_record['levelname'] = record.levelname

        super().add_fields(log_record, record, message_dict)

        # rename 후에도 level이 없으면 설정
        if 'level' not in log_record:
            log_record['level'] = record.levelname if hasattr(record, 'levelname') and record.levelname else 'INFO'
