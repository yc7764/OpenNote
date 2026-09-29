import { isValidNoteId, parseNoteId } from './note-id.util';

/**
 * 회귀: parseInt(noteId, 10)과 Number(noteId)의 발산으로 타인 노트를 가리키던
 * 문제를 파싱 단일화로 차단한다. 비정규 표기는 전부 거부되어야 하고,
 * 통과한 값은 parseInt === Number가 항상 성립해야 한다.
 */
describe('note-id.util', () => {
  describe('거부되어야 하는 비정규 noteId', () => {
    const invalid = [
      '1e3', // Number=1000, parseInt=1
      '0x64', // Number=100, parseInt=0
      '1e1',
      '1.9',
      '08', // 선행 0
      '0',
      '-1',
      '+1',
      ' 1e3 ',
      ' 123',
      '123 ',
      '1_000',
      '',
      'abc',
      '12a',
      'Infinity',
      'NaN',
    ];

    it.each(invalid)('%p → isValidNoteId=false, parseNoteId=null', (raw) => {
      expect(isValidNoteId(raw)).toBe(false);
      expect(parseNoteId(raw)).toBeNull();
    });
  });

  describe('허용되는 정규 noteId', () => {
    const valid = ['1', '10', '123', '999999', '9007199254740991'];

    it.each(valid)('%p → parseNoteId === Number === parseInt', (raw) => {
      const parsed = parseNoteId(raw);
      expect(parsed).toBe(Number(raw));
      expect(parsed).toBe(parseInt(raw, 10));
      expect(isValidNoteId(raw)).toBe(true);
    });
  });

  it('Number.MAX_SAFE_INTEGER를 초과하는 값은 거부한다', () => {
    expect(parseNoteId('9007199254740992')).toBeNull(); // MAX_SAFE_INTEGER + 1
  });

  it('문자열이 아닌 입력은 거부한다', () => {
    expect(isValidNoteId(123 as unknown)).toBe(false);
    expect(parseNoteId(null as unknown)).toBeNull();
    expect(parseNoteId(undefined as unknown)).toBeNull();
  });
});
