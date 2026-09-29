from rest_framework import serializers
from .models import FAQ, ContactInquiry


class FAQSerializer(serializers.ModelSerializer):
    """FAQ 시리얼라이저"""

    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = FAQ
        fields = ['id', 'category', 'category_display', 'question', 'answer']


class ContactInquiryCreateSerializer(serializers.ModelSerializer):
    """문의 생성 시리얼라이저"""

    class Meta:
        model = ContactInquiry
        fields = ['subject', 'message']

    def validate_subject(self, value):
        if len(value.strip()) < 2:
            raise serializers.ValidationError('제목은 2자 이상 입력해주세요.')
        return value.strip()

    def validate_message(self, value):
        stripped = value.strip()
        if len(stripped) < 10:
            raise serializers.ValidationError('문의 내용은 10자 이상 입력해주세요.')
        if len(stripped) > 2000:
            raise serializers.ValidationError('문의 내용은 2000자를 초과할 수 없습니다.')
        return stripped


class ContactInquiryListSerializer(serializers.ModelSerializer):
    """문의 목록 조회 시리얼라이저 (사용자용)"""

    has_reply = serializers.BooleanField(read_only=True)

    class Meta:
        model = ContactInquiry
        fields = ['id', 'subject', 'message', 'is_read', 'created_at', 'admin_reply', 'replied_at', 'has_reply']
        read_only_fields = fields
