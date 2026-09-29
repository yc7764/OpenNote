# celery_workers/common/utils.py
"""
공통 유틸리티 함수 (GPU 의존성 없음)

- Mistral API 호출
- 요약 결과 파싱
- 로컬 파일 정리
- 시간 제한 계산

Note: GPU/Whisper 관련 코드 제외 - Summary Worker에서 안전하게 사용 가능
"""
import os
import re
import requests
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)

# 미리 컴파일된 정규식 패턴
# 시:분:초 또는 분:초 형식 모두 지원 (1시간 이상 오디오 대응)
# 예: (0:00~2:30), (1:05:30~1:10:00)
TIME_PATTERN = re.compile(r'\((?:(\d+):)?(\d+):(\d+)~(?:(\d+):)?(\d+):(\d+)\)')

# 섹션 헤더 패턴 (종료 조건 감지용)
SECTION_HEADER_PATTERN = re.compile(r'^\[.+\]$')


def _get_required_env(var_name: str) -> str:
    """환경 변수 필수 검증 (내부용)"""
    value = os.environ.get(var_name)
    if not value:
        raise ValueError(
            f"Required environment variable '{var_name}' is not set. "
            f"Please configure it in your environment or .env file."
        )
    return value


def cleanup_local_file(file_path):
    """로컬 파일 삭제 (로깅 포함)

    Args:
        file_path: 삭제할 파일의 경로

    Note:
        파일 삭제 실패는 치명적이지 않으므로 에러를 발생시키지 않음
        대신 로그를 남겨 추후 디버깅에 활용
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Successfully cleaned up local file: {file_path}")
        else:
            logger.debug(f"File already deleted or not found: {file_path}")
    except PermissionError as e:
        logger.warning(f"Permission denied when deleting {file_path}: {e}")
    except OSError as e:
        logger.error(f"OS error when deleting {file_path}: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Unexpected error when deleting {file_path}: {e}", exc_info=True)


def call_summary_api(content, user_description=None, user_keywords=None):
    """폴백 체인을 통한 요약 API 호출

    여러 LLM API를 순차적으로 시도하여 안정성 확보:
    1. Groq Llama 3.3 70B (품질 우선)
    2. Gemini 1.5 Flash (한국어 우수)
    3. Mistral Small (기존 검증됨)
    4. Groq Llama 3.1 8B (최종 안전망)

    Args:
        content: STT 결과 데이터
        user_description: 사용자가 입력한 노트 설명 (선택사항)
        user_keywords: 사용자가 입력한 키워드 목록 (선택사항)

    Returns:
        tuple: (success: bool, result: str or tuple)
    """
    from celery_workers.common.providers import get_fallback_manager

    manager = get_fallback_manager()
    result = manager.call_with_fallback(content, user_description, user_keywords)

    # 하위 호환성: ProviderResult → tuple 변환
    return result.to_legacy_tuple()


def call_mistral_api(content, user_description=None, user_keywords=None):
    """Mistral API 직접 호출 (하위 호환성 유지)

    Note:
        새 코드에서는 call_summary_api() 사용 권장

    Args:
        content: STT 결과 데이터
        user_description: 사용자가 입력한 노트 설명 (선택사항)
        user_keywords: 사용자가 입력한 키워드 목록 (선택사항)

    Returns:
        tuple: (success: bool, result: str or tuple)
    """
    from celery_workers.common.prompts import SummaryPrompts

    api_url = "https://api.mistral.ai/v1/chat/completions"
    api_key = _get_required_env('MISTRAL_API_KEY')

    data = {
        "model": "mistral-small-latest",
        "messages": SummaryPrompts.get_messages(content, user_description, user_keywords),
        "max_tokens": 3200,
        "temperature": 0.5
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    response = requests.post(api_url, headers=headers, json=data, timeout=60)

    if response.status_code == 200:
        return True, response.json()["choices"][0]["message"]["content"]
    else:
        return False, (response.status_code, response.text)


def _is_section_header(line: str) -> bool:
    """섹션 헤더인지 확인 ([...] 형식)"""
    return bool(SECTION_HEADER_PATTERN.match(line))


def _get_next_non_empty_line(lines: list, start_idx: int) -> tuple:
    """빈 줄을 건너뛰고 다음 내용이 있는 줄 반환

    Returns:
        tuple: (line_content, line_index) or ("", -1) if not found
    """
    for j in range(start_idx, len(lines)):
        stripped = lines[j].strip()
        if stripped:
            return stripped, j
    return "", -1


def _collect_lines_until_section(lines: list, start_idx: int) -> list:
    """다음 섹션 헤더([...])까지 빈 줄을 건너뛰며 라인 수집"""
    collected = []
    for j in range(start_idx, len(lines)):
        stripped = lines[j].strip()
        # 섹션 헤더를 만나면 종료
        if _is_section_header(stripped):
            break
        # 빈 줄은 건너뛰고 내용만 수집
        if stripped:
            collected.append(stripped)
    return collected


def _parse_time_match(time_match) -> tuple:
    """시간 패턴 매칭 결과를 초 단위로 변환

    새 정규식 그룹:
    - group(1): 시작 시간 (선택)
    - group(2): 시작 분
    - group(3): 시작 초
    - group(4): 종료 시간 (선택)
    - group(5): 종료 분
    - group(6): 종료 초

    Returns:
        tuple: (start_seconds, end_seconds)
    """
    start_hour = int(time_match.group(1)) if time_match.group(1) else 0
    start_min = int(time_match.group(2))
    start_sec = int(time_match.group(3))

    end_hour = int(time_match.group(4)) if time_match.group(4) else 0
    end_min = int(time_match.group(5))
    end_sec = int(time_match.group(6))

    start_seconds = start_hour * 3600 + start_min * 60 + start_sec
    end_seconds = end_hour * 3600 + end_min * 60 + end_sec

    return start_seconds, end_seconds


def _collect_section_content(lines: list, start_idx: int) -> str:
    """구간 요약의 content 수집 (여러 줄 지원)

    다음 시간 패턴이나 섹션 헤더를 만나기 전까지 모든 내용 수집
    """
    content_lines = []
    for j in range(start_idx, len(lines)):
        stripped = lines[j].strip()
        # 빈 줄은 유지 (단락 구분)
        if not stripped:
            # 이미 내용이 있고 빈 줄이면 단락 구분으로 추가
            if content_lines:
                content_lines.append("")
            continue
        # 새 시간 패턴이나 섹션 헤더를 만나면 종료
        if TIME_PATTERN.search(stripped) or _is_section_header(stripped):
            break
        content_lines.append(stripped)

    # 끝의 빈 줄 제거 후 join
    while content_lines and content_lines[-1] == "":
        content_lines.pop()

    return '\n'.join(content_lines).replace('**', '')


def parse_summary_result(result):
    """요약 결과 파싱 (에러 처리 강화)

    Args:
        result: AI 모델의 요약 결과 텍스트

    Returns:
        tuple: (main_topic, keywords, next_actions, sections)

    Note:
        - 파싱 실패 시에도 기본값을 반환하여 시스템이 중단되지 않도록 함
        - 빈 줄을 건너뛰어 LLM 출력 형식 변동에 대응
        - 1시간 이상 오디오의 시:분:초 형식 지원
    """
    try:
        lines = result.split('\n')

        main_topic = ""
        keywords = []
        next_actions = ""
        sections = []

        current_section = None

        for i, line in enumerate(lines):
            line = line.strip()

            # 주제 추출 - 빈 줄 건너뛰기 지원
            if '주제' in line and _is_section_header(line) and not main_topic:
                next_content, _ = _get_next_non_empty_line(lines, i + 1)
                if next_content and not _is_section_header(next_content):
                    main_topic = next_content.replace('**', '').replace('- ', '')

            # 키워드 추출 - 빈 줄 건너뛰기 및 섹션 헤더 종료 조건
            elif '키워드' in line and _is_section_header(line) and not keywords:
                keyword_lines = _collect_lines_until_section(lines, i + 1)
                # 쉼표로 구분된 키워드를 배열로 변환
                all_keywords = ', '.join(keyword_lines)
                keywords = [kw.strip() for kw in all_keywords.split(',') if kw.strip()]

            # 다음 액션 추출 - 빈 줄 건너뛰기 및 섹션 헤더 종료 조건
            elif '다음' in line and '액션' in line and _is_section_header(line) and not next_actions:
                action_lines = _collect_lines_until_section(lines, i + 1)
                next_actions = '\n'.join(action_lines)

            # 구간 요약 추출
            elif '구간' in line and '요약' in line and _is_section_header(line):
                current_section = "parsing_sections"

            elif current_section == "parsing_sections" and line:
                # 다른 섹션 헤더를 만나면 구간 파싱 종료
                if _is_section_header(line):
                    current_section = None
                    continue

                # 시간 패턴 찾기: (0:00~0:30), (1:05:30~1:10:00) 등
                time_match = TIME_PATTERN.search(line)
                if time_match:
                    try:
                        start_seconds, end_seconds = _parse_time_match(time_match)

                        # 제목 추출 (시간 패턴 이후 부분)
                        title = line[time_match.end():].strip().replace('**', '').replace('*', '')

                        # 다음 줄부터 content 수집 (여러 줄 지원)
                        content = _collect_section_content(lines, i + 1)

                        sections.append({
                            "title": title,
                            "start_time": start_seconds,
                            "end_time": end_seconds,
                            "content": content,
                            "order": len(sections) + 1
                        })
                    except (ValueError, IndexError) as e:
                        logger.warning(f"Failed to parse section time: {line}, error: {e}")
                        continue

        # 검증: 필수 필드 확인
        if not main_topic:
            logger.warning("Main topic not found in summary result")
            main_topic = "주제를 찾을 수 없음"

        if not keywords:
            logger.warning("Keywords not found in summary result")
            keywords = ["키워드 없음"]

        if not next_actions:
            logger.info("No action items found in summary result")
            next_actions = "특별한 액션 항목 없음"

        if not sections:
            logger.warning("No sections found in summary result")
            # 기본 섹션 생성
            sections = [{
                "title": "전체 요약",
                "start_time": 0,
                "end_time": 0,
                "content": main_topic,
                "order": 1
            }]

        return main_topic, keywords, next_actions, sections

    except Exception as e:
        logger.error(f"Critical error parsing summary result: {e}", exc_info=True)
        # 파싱 완전 실패 시 기본값 반환
        return (
            "파싱 오류 발생",
            ["파싱 실패"],
            "파싱 오류로 액션 항목을 추출할 수 없습니다",
            [{
                "title": "파싱 오류",
                "start_time": 0,
                "end_time": 0,
                "content": "요약 결과를 파싱하는 중 오류가 발생했습니다",
                "order": 1
            }]
        )


def calculate_stt_time_limit(duration_seconds: int) -> int:
    """
    STT Task 시간 제한 계산 (오디오 길이 기반)

    Args:
        duration_seconds: 오디오 길이 (초)

    Returns:
        time_limit: Task 시간 제한 (초)

    공식: (duration * 2) + 300 (5분 여유)
    """
    base_limit = (duration_seconds * 2) + 300
    min_limit = 600     # 10분
    max_limit = 50400   # 14시간 (6시간 오디오 처리 가능)
    return max(min_limit, min(base_limit, max_limit))


def calculate_summary_time_limit(duration_seconds: int) -> int:
    """
    Summary Task 시간 제한 계산

    Summary는 오디오 길이와 거의 무관 (Mistral API 호출 시간)
    """
    return 600  # 10분 고정
