# celery_workers/gpu/speaker_mapping.py
"""
화자 분할 결과와 STT 결과 매핑 모듈

pyannote.audio diarization 결과를 Whisper 전사 결과에 매핑하는 로직을 제공합니다.
whisperx 의존성 없이 순수하게 pyannote.audio 결과를 처리합니다.

주요 기능:
- assign_speakers_to_segments: 화자를 STT segment에 할당
- process_speaker_labels: 화자 레이블 한국어 변환
- get_speaker_timeline: 화자별 발화 구간 추출
"""
from collections import defaultdict
from typing import Dict, List, Any, Tuple
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


def assign_speakers_to_segments(
    diarization_result,
    transcription_result: Dict[str, Any],
    use_exclusive: bool = True
) -> Dict[str, Any]:
    """화자 분리 결과를 Whisper 전사 결과에 매핑

    pyannote.audio의 diarization 결과를 Whisper 전사 segment에 할당합니다.
    community-1 모델의 exclusive_speaker_diarization 기능을 활용하여
    더 정확한 화자 경계를 제공합니다.

    Args:
        diarization_result: pyannote Pipeline 출력 (Annotation 객체)
        transcription_result: format_transcription() 출력
            {
                "segments": [{"start": float, "end": float, "text": str, "words": [...]}],
                "word_segments": [...]
            }
        use_exclusive: exclusive_speaker_diarization 사용 여부 (기본값: True)
            - True: 겹침 없이 한 화자만 할당 (STT 통합에 적합)
            - False: 원본 diarization 사용 (겹침 허용)

    Returns:
        dict: speaker 정보가 추가된 transcription_result

    Algorithm:
        1. diarization 결과에서 (시간 구간, 화자) 쌍 추출
        2. 각 STT segment에 대해 가장 많이 겹치는 화자 찾기 (overlap 기반)
        3. word 레벨에서도 화자 할당 (시작 시간 기준)
    """
    # speaker segments 추출
    speaker_segments = _extract_speaker_segments(diarization_result, use_exclusive)

    segments = transcription_result.get('segments', [])

    for seg in segments:
        seg_start = seg.get('start', 0)
        seg_end = seg.get('end', 0)

        # 해당 segment와 가장 많이 겹치는 speaker 찾기
        best_speaker = _find_best_speaker_for_segment(
            seg_start, seg_end, speaker_segments
        )
        seg['speaker'] = best_speaker

        # word 레벨 speaker 할당
        _assign_speakers_to_words(seg, speaker_segments)

    return transcription_result


def _extract_speaker_segments(
    diarization_result,
    use_exclusive: bool
) -> List[Tuple[Any, str]]:
    """diarization 결과에서 (turn, speaker) 쌍 추출

    Args:
        diarization_result: pyannote Annotation 객체
        use_exclusive: exclusive_speaker_diarization 사용 여부

    Returns:
        List[Tuple[Segment, str]]: (시간 구간, 화자) 쌍 리스트
    """
    if use_exclusive and hasattr(diarization_result, 'exclusive_speaker_diarization'):
        # community-1의 exclusive speaker diarization 사용
        speaker_segments = [
            (turn, speaker)
            for turn, speaker in diarization_result.exclusive_speaker_diarization
        ]
        logger.info("Using exclusive_speaker_diarization for better STT integration")
    else:
        # 기본 diarization 사용 (3.1 호환)
        speaker_segments = [
            (turn, speaker)
            for turn, _, speaker in diarization_result.itertracks(yield_label=True)
        ]

    return speaker_segments


def _find_best_speaker_for_segment(
    seg_start: float,
    seg_end: float,
    speaker_segments: List[Tuple[Any, str]],
    default_speaker: str = 'SPEAKER_00'
) -> str:
    """segment와 가장 많이 겹치는 화자 찾기 (overlap 기반)

    Args:
        seg_start: segment 시작 시간
        seg_end: segment 종료 시간
        speaker_segments: (turn, speaker) 쌍 리스트
        default_speaker: 매칭되는 화자가 없을 때 기본값

    Returns:
        str: 가장 많이 겹치는 화자 ID
    """
    speaker_overlaps = defaultdict(float)

    for turn, speaker in speaker_segments:
        overlap_start = max(seg_start, turn.start)
        overlap_end = min(seg_end, turn.end)

        if overlap_end > overlap_start:
            speaker_overlaps[speaker] += (overlap_end - overlap_start)

    if speaker_overlaps:
        return max(speaker_overlaps, key=speaker_overlaps.get)
    else:
        return default_speaker


def _assign_speakers_to_words(
    segment: Dict[str, Any],
    speaker_segments: List[Tuple[Any, str]]
) -> None:
    """segment 내 각 word에 화자 할당 (in-place 수정)

    word의 시작 시간을 기준으로 해당 시점에 발화 중인 화자를 할당합니다.

    Args:
        segment: 화자가 이미 할당된 segment
        speaker_segments: (turn, speaker) 쌍 리스트
    """
    seg_speaker = segment.get('speaker', 'SPEAKER_00')
    seg_start = segment.get('start', 0)

    for word in segment.get('words', []):
        word_start = word.get('start', seg_start)

        word_speaker = None
        for turn, speaker in speaker_segments:
            if turn.start <= word_start < turn.end:
                word_speaker = speaker
                break

        word['speaker'] = word_speaker if word_speaker else seg_speaker


def process_speaker_labels(
    result: Dict[str, Any],
    label_format: str = "참석자{n}"
) -> Tuple[Dict[str, Any], Dict[str, Dict[str, str]]]:
    """화자 레이블을 ID 형식으로 변환하고 스피커 딕셔너리 생성

    SPEAKER_00, SPEAKER_01 등의 기술적 레이블을 "sp_0", "sp_1" 등의 ID로 변환하고,
    스피커 메타데이터 딕셔너리를 생성합니다.

    Args:
        result: assign_speakers_to_segments() 출력
        label_format: 표시 이름 포맷 (기본값: "참석자{n}")
            {n}은 1부터 시작하는 화자 번호로 치환됨

    Returns:
        Tuple[dict, dict]:
            - result: speaker 필드가 ID(sp_0 등)로 변환된 결과
            - speakers_dict: {"sp_0": {"name": "참석자1"}, "sp_1": {"name": "참석자2"}, ...}
    """
    segments = result.get('segments', [])
    speaker_id_map = {}  # SPEAKER_00 -> sp_0
    speakers_dict = {}   # sp_0 -> {"name": "참석자1"}
    speaker_counter = 0

    for segment in segments:
        if 'speaker' not in segment:
            # 스피커 정보 없는 경우 기본값
            segment['speaker'] = 'sp_0'
            if 'sp_0' not in speakers_dict:
                speakers_dict['sp_0'] = {"name": label_format.format(n=1)}
        else:
            original_speaker = segment['speaker']
            if original_speaker not in speaker_id_map:
                sp_id = f"sp_{speaker_counter}"
                display_name = label_format.format(n=speaker_counter + 1)
                speaker_id_map[original_speaker] = sp_id
                speakers_dict[sp_id] = {"name": display_name}
                speaker_counter += 1
            segment['speaker'] = speaker_id_map[original_speaker]

        # word 레벨 레이블도 변환
        for word in segment.get('words', []):
            if 'speaker' in word:
                word_speaker = word['speaker']
                if word_speaker in speaker_id_map:
                    word['speaker'] = speaker_id_map[word_speaker]
                elif not word_speaker.startswith('sp_'):
                    # 매핑에 없고 아직 변환 안된 스피커 → 세그먼트 스피커 사용
                    word['speaker'] = segment['speaker']

    return result, speakers_dict


def get_speaker_timeline(
    diarization_result,
    use_exclusive: bool = True
) -> List[Dict[str, Any]]:
    """화자별 발화 구간 타임라인 추출

    diarization 결과를 화자별 발화 구간 리스트로 변환합니다.

    Args:
        diarization_result: pyannote Annotation 객체
        use_exclusive: exclusive_speaker_diarization 사용 여부

    Returns:
        List[Dict]: [{"start": float, "end": float, "speaker": str}, ...]
    """
    speaker_segments = _extract_speaker_segments(diarization_result, use_exclusive)

    timeline = []
    for turn, speaker in speaker_segments:
        timeline.append({
            "start": turn.start,
            "end": turn.end,
            "speaker": speaker,
            "duration": turn.end - turn.start
        })

    return sorted(timeline, key=lambda x: x['start'])


def get_speaker_statistics(
    diarization_result,
    use_exclusive: bool = True
) -> Dict[str, Dict[str, Any]]:
    """화자별 통계 정보 추출

    Args:
        diarization_result: pyannote Annotation 객체
        use_exclusive: exclusive_speaker_diarization 사용 여부

    Returns:
        Dict: {
            "SPEAKER_00": {
                "total_duration": float,
                "segment_count": int,
                "avg_segment_duration": float
            },
            ...
        }
    """
    speaker_segments = _extract_speaker_segments(diarization_result, use_exclusive)

    stats = defaultdict(lambda: {"total_duration": 0.0, "segment_count": 0})

    for turn, speaker in speaker_segments:
        duration = turn.end - turn.start
        stats[speaker]["total_duration"] += duration
        stats[speaker]["segment_count"] += 1

    # 평균 계산
    for speaker in stats:
        count = stats[speaker]["segment_count"]
        total = stats[speaker]["total_duration"]
        stats[speaker]["avg_segment_duration"] = total / count if count > 0 else 0.0

    return dict(stats)
