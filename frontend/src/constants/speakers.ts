/**
 * 스피커 관련 상수 및 유틸리티 함수
 */

export interface SpeakerColor {
  light: string;
  dark: string;
}

/**
 * 스피커별 색상 팔레트
 * 인덱스 순서대로 스피커에 할당됨
 */
export const SPEAKER_COLORS: SpeakerColor[] = [
  { light: '#6b7280', dark: '#9ca3af' }, // gray
  { light: '#8b5cf6', dark: '#a78bfa' }, // purple
  { light: '#3b82f6', dark: '#60a5fa' }, // blue
  { light: '#14b8a6', dark: '#2dd4bf' }, // teal
  { light: '#ec4899', dark: '#f472b6' }, // pink
  { light: '#f59e0b', dark: '#fbbf24' }, // amber
  { light: '#10b981', dark: '#34d399' }, // emerald
  { light: '#ef4444', dark: '#f87171' }, // red
];

/**
 * 스피커 ID에서 색상 인덱스 추출
 * @param speakerId - "sp_0", "sp_1" 형식의 스피커 ID
 * @returns 색상 인덱스 (0-based), 파싱 실패 시 0 반환
 */
export function getSpeakerColorIndex(speakerId: string): number {
  const match = speakerId.match(/^sp_(\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // 레거시 형식("참석자1" 등) 또는 잘못된 형식 → 기본값 0
  return 0;
}

/**
 * 스피커 이름 정규화 (특수문자 제거 및 길이 제한)
 * @param name - 원본 스피커 이름
 * @returns 정규화된 스피커 이름
 */
export function sanitizeSpeakerName(name: string): string {
  return name
    .trim()
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 제어 문자 제거
    .replace(/[<>]/g, '') // HTML 태그 문자 제거
    .slice(0, 100); // 최대 길이 제한 (백엔드와 동일)
}
