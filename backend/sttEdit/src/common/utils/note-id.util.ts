/**
 * noteId 파싱을 단일 지점으로 통일.
 *
 * 배경: 소유권 판정에는 parseInt(noteId, 10), 실제 DB 대상 확정에는 Number(noteId)를
 * 쓰던 불일치로 인해 "1e3"(parseInt=1, Number=1000), "0x64"(parseInt=0, Number=100) 같은
 * 입력이 서로 다른 노트를 가리켰다. 아래 헬퍼로 파싱을 일원화해 발산 자체를 제거한다.
 *
 * 정규화 규칙: 선행 0·부호·지수·16진수·공백을 모두 배제한 순수 양의 정수 문자열만 허용하고,
 * Number.MAX_SAFE_INTEGER를 넘는 값은 거부한다(Number/parseInt 모두 JS number를 쓰므로).
 */

/** 순수 양의 정수(선행 0 없음). 최대 19자리까지 형식 허용 후 안전 정수 범위로 2차 검증. */
const NOTE_ID_PATTERN = /^[1-9]\d{0,18}$/;

/**
 * noteId 문자열이 정규화된 양의 정수 형식이며 안전 정수 범위인지 검사한다.
 */
export function isValidNoteId(noteId: unknown): noteId is string {
  if (typeof noteId !== 'string' || !NOTE_ID_PATTERN.test(noteId)) {
    return false;
  }
  return Number.isSafeInteger(Number(noteId));
}

/**
 * noteId 문자열을 정수로 파싱한다. 형식이 유효하지 않으면 null을 반환한다.
 * 유효한 입력에서는 parseInt(noteId, 10) === Number(noteId)가 항상 성립한다.
 */
export function parseNoteId(noteId: unknown): number | null {
  return isValidNoteId(noteId) ? Number(noteId) : null;
}
