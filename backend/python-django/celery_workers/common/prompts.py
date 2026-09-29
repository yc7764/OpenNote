"""
회의록 및 음성 대화 요약 프롬프트 템플릿 관리

프롬프트를 코드와 분리하여 관리함으로써:
- 프롬프트 변경 시 코드 재배포 불필요
- A/B 테스트 및 프롬프트 최적화 용이
- 버전 관리 및 롤백 가능

Note:
    celery_workers에서 독립적으로 사용 가능 (Django 앱 의존성 없음)
"""
from typing import Optional, List


class SummaryPrompts:
    """요약 생성을 위한 프롬프트 템플릿"""

    # 시스템 프롬프트 (AI의 역할 정의)
    SYSTEM = """너는 회의록 및 음성 대화 요약 전문가야.

역할:
- 대화 내용을 분석하여 핵심 정보 추출
- 명확하고 실용적인 요약 제공
- 액션 아이템과 후속 조치 식별

출력 규칙:
- 반드시 지정된 포맷([섹션명] 형식)만 사용
- 마크다운 문법(#, -, *, **) 절대 사용 금지
- 일반 텍스트로만 작성
- 모든 섹션 헤더는 반드시 포함"""

    # 사용자 프롬프트 템플릿
    USER_TEMPLATE = """다음 대화 내용을 아래 포맷에 정확히 맞춰서 요약해줘.

=== 출력 포맷 (이 형식을 정확히 따를 것) ===

[주제]
(대화의 핵심 주제를 한 문장으로)

[키워드]
(쉼표로 구분된 3-7개의 핵심 키워드)

[다음 액션]
(각 줄에 하나씩, 구체적인 할 일 목록. 없으면 "없음")

[구간 요약]
(시작시간~종료시간) 소주제명
요약 내용

=== 예시 ===

[주제]
2024년 1분기 마케팅 전략 회의

[키워드]
SNS 마케팅, 인플루언서, 예산 배분, KPI, 타겟 고객

[다음 액션]
인플루언서 후보 리스트 작성 (담당: 김대리, 기한: 1/15)
SNS 광고 예산안 검토 (담당: 이과장)
경쟁사 분석 보고서 공유

[구간 요약]
(0:00~2:30) 회의 시작 및 안건 소개
팀장이 회의 목적과 주요 안건을 설명했다.

(2:30~8:15) SNS 마케팅 전략 논의
인스타그램과 유튜브 채널 운영 방안에 대해 토론했다.

=== 규칙 ===
- 마크다운 문법 사용 금지 (#, -, *, ** 등)
- 각 섹션 헤더는 [대괄호]로 표시
- 구간 요약은 대화 흐름에 따라 자연스럽게 분할 (3분 미만: 1개, 3분 이상: 2-5개 구간)
- 내용이 없는 섹션도 헤더는 포함하고 "없음" 표시
- 음성 인식 오류로 보이는 단어는 문맥에 맞게 자연스럽게 수정
{user_context}
=== 대화 내용 ===
{content}"""

    @classmethod
    def get_system_prompt(cls) -> str:
        """시스템 프롬프트 반환"""
        return cls.SYSTEM

    @classmethod
    def _format_time(cls, seconds: float) -> str:
        """
        초를 시:분:초 또는 분:초 형식으로 변환

        Args:
            seconds: 초 단위 시간 (float)

        Returns:
            포맷팅된 시간 문자열
            - 1시간 미만: "M:SS" (예: "5:30")
            - 1시간 이상: "H:MM:SS" (예: "1:05:30")
        """
        total_seconds = int(seconds)
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        secs = total_seconds % 60

        if hours > 0:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        return f"{minutes}:{secs:02d}"

    @classmethod
    def _simplify_content(cls, content: dict) -> str:
        """
        요약에 필요한 최소 정보만 추출하여 텍스트로 변환

        STT 결과에서 요약에 불필요한 필드(words, word_segments, idx, score 등)를
        제거하고, 토큰 효율적인 텍스트 포맷으로 변환합니다.

        Args:
            content: STT 결과 데이터 (segments 포함)

        Returns:
            간소화된 텍스트 포맷
            예: "[0:00~0:30] 참석자0: 안녕하세요"

        Note:
            - JSON 대비 약 73% 토큰 절감 예상
            - 빈 텍스트 세그먼트는 자동으로 필터링됨
        """
        lines = []

        for seg in content.get('segments', []):
            start = seg.get('start', 0)
            end = seg.get('end', 0)
            speaker = seg.get('speaker', '참석자')
            text = seg.get('text', '').strip()

            if text:
                start_fmt = cls._format_time(start)
                end_fmt = cls._format_time(end)
                lines.append(f"[{start_fmt}~{end_fmt}] {speaker}: {text}")

        return "\n".join(lines)

    @classmethod
    def _build_user_context(
        cls,
        user_description: Optional[str] = None,
        user_keywords: Optional[List[str]] = None
    ) -> str:
        """
        사용자 제공 컨텍스트 문자열 생성

        Args:
            user_description: 사용자가 입력한 노트 설명
            user_keywords: 사용자가 입력한 키워드 목록

        Returns:
            포맷팅된 사용자 컨텍스트 문자열
        """
        if not user_description and not user_keywords:
            return ""

        context_parts = ["\n[사용자 제공 정보]"]
        if user_description:
            context_parts.append(f"설명: {user_description}")
        if user_keywords:
            context_parts.append(f"키워드: {', '.join(user_keywords)}")
        context_parts.append("\n위 정보를 참고하여 핵심 주제와 키워드를 선정해줘.\n")

        return "\n".join(context_parts)

    @classmethod
    def get_user_prompt(
        cls,
        content: dict,
        user_description: Optional[str] = None,
        user_keywords: Optional[List[str]] = None
    ) -> str:
        """
        사용자 프롬프트 생성

        Args:
            content: STT 결과 데이터 (JSON 직렬화 가능한 dict)
            user_description: 사용자가 입력한 노트 설명
            user_keywords: 사용자가 입력한 키워드 목록

        Returns:
            포맷팅된 사용자 프롬프트

        Note:
            토큰 최적화를 위해 JSON 대신 간소화된 텍스트 포맷 사용
            - 불필요한 필드 제거 (words, word_segments, idx, score)
            - 약 73% 토큰 절감
        """
        user_context = cls._build_user_context(user_description, user_keywords)
        simplified_content = cls._simplify_content(content)
        return cls.USER_TEMPLATE.format(
            user_context=user_context,
            content=simplified_content
        )

    @classmethod
    def get_messages(
        cls,
        content: dict,
        user_description: Optional[str] = None,
        user_keywords: Optional[List[str]] = None
    ) -> list:
        """
        API용 전체 메시지 배열 생성

        Args:
            content: STT 결과 데이터
            user_description: 사용자가 입력한 노트 설명
            user_keywords: 사용자가 입력한 키워드 목록

        Returns:
            OpenAI 호환 메시지 포맷 [{"role": "system", "content": ...}, ...]
        """
        return [
            {
                "role": "system",
                "content": cls.get_system_prompt()
            },
            {
                "role": "user",
                "content": cls.get_user_prompt(content, user_description, user_keywords)
            }
        ]
