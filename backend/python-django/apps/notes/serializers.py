import re
from rest_framework import serializers
from .models import Note, Summary, SummarySection, NoteSegment

class NoteSegmentSerializer(serializers.ModelSerializer):
    # speaker 필드는 이제 "sp_0" 형식 ID
    # speaker_name은 Note.speakers에서 조회한 실제 표시 이름
    speaker_name = serializers.SerializerMethodField()

    class Meta:
        model = NoteSegment
        exclude = ['words']  # words 필드만 제외, 나머지 모두 포함

    def get_speaker_name(self, obj):
        """Note.speakers에서 실제 이름 조회"""
        note = obj.stt_id
        if note and note.speakers and obj.speaker:
            speaker_info = note.speakers.get(obj.speaker, {})
            return speaker_info.get('name', obj.speaker)
        return obj.speaker

class SummarySectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SummarySection
        # '__all__' 대신 명시 필드 — 향후 모델에 필드가 추가돼도 자동 노출되지 않도록.
        fields = ['id', 'summary', 'title', 'start_time', 'end_time', 'content', 'order']

class SummarySerializer(serializers.ModelSerializer):
    sections = SummarySectionSerializer(many=True, read_only=True)

    class Meta:
        model = Summary
        # '__all__' 대신 명시 필드 (기존 __all__ 출력과 동일 집합)
        fields = ['id', 'keywords', 'main_topic', 'next_actions', 'created_at', 'updated_at', 'sections']

class NoteSerializer(serializers.ModelSerializer):
    summary = SummarySerializer(read_only=True)
    user = serializers.ReadOnlyField(source='user.username')
    speakers = serializers.JSONField(required=False)

    class Meta:
        model = Note
        fields = [
            'id', 'user', 'title', 'content', 'created_at', 'updated_at',
            'duration', 'is_recording', 'processing_status', 'preview',
            'summary', 'audio_file', 'speakers', 'is_favorite',
            'user_description', 'user_keywords',
        ]

    def validate_speakers(self, value):
        """
        speakers JSONField 검증
        예상 형식: {"sp_0": {"name": "참석자1"}, "sp_1": {"name": "참석자2"}, ...}
        """
        if value is None or value == {}:
            return value

        if not isinstance(value, dict):
            raise serializers.ValidationError("speakers must be a dictionary")

        # 최대 스피커 수 제한 (DoS 방지)
        MAX_SPEAKERS = 50
        if len(value) > MAX_SPEAKERS:
            raise serializers.ValidationError(f"Maximum {MAX_SPEAKERS} speakers allowed")

        for speaker_id, speaker_data in value.items():
            # 스피커 ID 형식 검증 (sp_0, sp_1, ...)
            if not isinstance(speaker_id, str):
                raise serializers.ValidationError(f"Speaker ID must be a string")

            if not re.match(r'^sp_\d+$', speaker_id):
                raise serializers.ValidationError(
                    f"Invalid speaker ID format: {speaker_id}. Expected 'sp_N' format"
                )

            # 스피커 데이터 검증
            if not isinstance(speaker_data, dict):
                raise serializers.ValidationError(
                    f"Speaker data for {speaker_id} must be a dictionary"
                )

            # name 필드 필수
            if 'name' not in speaker_data:
                raise serializers.ValidationError(
                    f"Speaker {speaker_id} must have a 'name' field"
                )

            # name 필드 타입 및 길이 검증
            name = speaker_data.get('name')
            if not isinstance(name, str):
                raise serializers.ValidationError(
                    f"Speaker name for {speaker_id} must be a string"
                )

            MAX_NAME_LENGTH = 100
            if len(name) > MAX_NAME_LENGTH:
                raise serializers.ValidationError(
                    f"Speaker name for {speaker_id} exceeds {MAX_NAME_LENGTH} characters"
                )

            # 허용된 필드만 포함 (추가 메타데이터 방지)
            ALLOWED_FIELDS = {'name'}
            extra_fields = set(speaker_data.keys()) - ALLOWED_FIELDS
            if extra_fields:
                raise serializers.ValidationError(
                    f"Speaker {speaker_id} has unexpected fields: {extra_fields}"
                )

        return value 