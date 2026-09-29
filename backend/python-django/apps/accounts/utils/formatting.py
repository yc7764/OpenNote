"""
포맷팅 유틸리티 함수들
"""


def format_bytes(size_bytes: int) -> str:
    """
    바이트를 사람이 읽기 쉬운 형식으로 변환 (적응형 단위)

    Args:
        size_bytes: 바이트 단위 크기

    Returns:
        포맷된 문자열 (예: "1.5GB", "256MB", "64KB", "512B")
    """
    if size_bytes >= 1024 ** 3:
        return f"{size_bytes / (1024 ** 3):.1f}GB"
    elif size_bytes >= 1024 ** 2:
        return f"{size_bytes / (1024 ** 2):.1f}MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.1f}KB"
    return f"{size_bytes}B"


def format_bytes_to_mb(size_bytes: int) -> str:
    """
    바이트를 MB 단위로 변환

    Args:
        size_bytes: 바이트 단위 크기

    Returns:
        포맷된 문자열 (예: "256.5 MB")
    """
    mb = size_bytes / 1024 / 1024
    if mb >= 1024:
        return f'{mb / 1024:.2f} GB'
    return f'{mb:.1f} MB'


def format_bytes_to_gb(size_bytes: int) -> str:
    """
    바이트를 GB 단위로 변환

    Args:
        size_bytes: 바이트 단위 크기

    Returns:
        포맷된 문자열 (예: "1.5 GB")
    """
    gb = size_bytes / 1024 / 1024 / 1024
    return f'{gb:.1f} GB'
