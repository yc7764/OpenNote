from django.contrib import admin
from .models import Summary, SummarySection, Note

# SummarySection을 Summary의 인라인으로 표시
class SummarySectionInline(admin.TabularInline):
    model = SummarySection
    extra = 0  # 추가 빈 폼 개수
    fields = ('title', 'start_time', 'end_time', 'content', 'order')
    ordering = ('order', 'start_time')

# Summary 모델 관리자 설정
@admin.register(Summary)
class SummaryAdmin(admin.ModelAdmin):
    # 목록 페이지에서 표시할 필드들
    list_display = ('id', 'main_topic', 'created_at', 'updated_at', 'sections_count')
    
    # 필터 옵션
    list_filter = ('created_at', 'updated_at')
    
    # 검색 필드
    search_fields = ('main_topic', 'keywords', 'next_actions')
    
    # 상세 페이지에서 편집할 필드들
    fieldsets = (
        ('기본 정보', {
            'fields': ('main_topic', 'keywords', 'next_actions')
        }),
        ('시간 정보', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    # 읽기 전용 필드
    readonly_fields = ('created_at', 'updated_at')
    
    # 인라인 설정
    inlines = [SummarySectionInline]
    
    # 날짜 기준 정렬
    ordering = ('-created_at',)
    
    # 페이지당 표시할 항목 수
    list_per_page = 25
    
    # 커스텀 메서드 - 섹션 개수 표시
    def sections_count(self, obj):
        return obj.sections.count()
    sections_count.short_description = '섹션 개수'

# SummarySection 모델 관리자 설정
@admin.register(SummarySection)
class SummarySectionAdmin(admin.ModelAdmin):
    # 목록 페이지에서 표시할 필드들
    list_display = ('title', 'summary', 'start_time', 'end_time', 'order')
    
    # 필터 옵션
    list_filter = ('summary', 'start_time', 'end_time')
    
    # 검색 필드
    search_fields = ('title', 'content', 'summary__main_topic')
    
    # 상세 페이지에서 편집할 필드들
    fieldsets = (
        ('기본 정보', {
            'fields': ('summary', 'title', 'order')
        }),
        ('시간 정보', {
            'fields': ('start_time', 'end_time')
        }),
        ('내용', {
            'fields': ('content',)
        }),
    )
    
    # 날짜 기준 정렬
    ordering = ('summary', 'order', 'start_time')
    
    # 페이지당 표시할 항목 수
    list_per_page = 25
    
    # 목록에서 편집 가능한 필드들
    list_editable = ('order',)

# Note 모델 관리자 설정
@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    # 목록 페이지에서 표시할 필드들
    list_display = ('title', 'user', 'duration', 'is_recording', 'created_at', 'updated_at', 'has_summary')
    
    # 필터 옵션
    list_filter = ('is_recording', 'created_at', 'updated_at', 'user')
    
    # 검색 필드
    search_fields = ('title', 'user__username', 'user__email')
    
    # 상세 페이지에서 편집할 필드들
    fieldsets = (
        ('기본 정보', {
            'fields': ('title', 'user', 'duration', 'is_recording')
        }),
        ('파일 정보', {
            'fields': ('audio_file',)
        }),
        ('내용', {
            'fields': ('content',)
        }),
        ('요약', {
            'fields': ('summary',)
        }),
        ('시간 정보', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
        ('처리 상태', {
            'fields': ('processing_status',)
        }),
        ('미리보기', {
            'fields': ('preview',)
        }),
    )
    
    # 읽기 전용 필드
    readonly_fields = ('created_at', 'updated_at')
    
    # 날짜 기준 정렬
    ordering = ('-updated_at',)
    
    # 페이지당 표시할 항목 수
    list_per_page = 25
    
    # 목록에서 편집 가능한 필드들
    list_editable = ('is_recording',)
    
    # 커스텀 메서드 - 요약 여부 표시
    def has_summary(self, obj):
        return obj.summary is not None
    has_summary.boolean = True
    has_summary.short_description = '요약 여부'
    
    # 사용자 정보 표시
    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.select_related('user', 'summary')
