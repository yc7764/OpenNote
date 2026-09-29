import { validateUpdateNoteData, validateSetSpeakerData } from './websocket.data-validator';
import { detectXssAttempt, sanitizeXss } from './dto/update-note.dto';
import { ErrorCode } from '../common/error-code.enum';

// 회귀: update DTO의 segmentId/sectionId는 Redis 키·스케줄러의
// key.split(':') 파싱에 그대로 쓰인다. 콜론 등이 섞이면 keyParts 인덱스가 밀려
// 엉뚱한 세그먼트/섹션에 기록되므로(무결성 손상) 숫자만 허용해야 한다.
describe('validateUpdateNoteData - segmentId/sectionId 형식 검증', () => {
  const baseSegment = {
    noteId: '123',
    type: 'segment' as const,
    payload: 'hello world',
    updatedBy: '1',
  };

  it('숫자 segmentId는 통과한다', () => {
    const result = validateUpdateNoteData({ ...baseSegment, segmentId: '5' });
    expect(result.success).toBe(true);
  });

  it('콜론이 섞인 segmentId는 거부한다 (key.split(":") 오파싱 방지)', () => {
    const result = validateUpdateNoteData({ ...baseSegment, segmentId: '1:2' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.INVALID_DATA_TYPE);
  });

  it('숫자가 아닌 segmentId는 거부한다', () => {
    const result = validateUpdateNoteData({ ...baseSegment, segmentId: 'abc' });
    expect(result.success).toBe(false);
  });

  it('숫자 sectionId는 통과한다', () => {
    const result = validateUpdateNoteData({
      noteId: '123',
      type: 'summary_text',
      sectionId: '2',
      payload: { title: 't', content: 'c' },
      updatedBy: '1',
    });
    expect(result.success).toBe(true);
  });

  it('콜론이 섞인 sectionId는 거부한다', () => {
    const result = validateUpdateNoteData({
      noteId: '123',
      type: 'summary_text',
      sectionId: '2:9',
      payload: { title: 't', content: 'c' },
      updatedBy: '1',
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.INVALID_DATA_TYPE);
  });
});

// 회귀: XSS 시도 탐지기. "값이 바뀜"을 신호로 쓰면 일반 텍스트(&·/·=)가
// 오탐되므로, 실제 주입 신호(앵글 브래킷·위험 스킴)만 true여야 한다.
describe('detectXssAttempt', () => {
  it('앵글 브래킷 주입은 탐지한다', () => {
    expect(detectXssAttempt('<script>alert(1)</script>')).toBe(true);
  });

  it('위험 URL 스킴은 탐지한다', () => {
    expect(detectXssAttempt('javascript:alert(1)')).toBe(true);
  });

  it('URL 이중 인코딩된 앵글 브래킷도 탐지한다', () => {
    expect(detectXssAttempt('%3Cscript%3E')).toBe(true);
  });

  it('전각 앵글 브래킷 우회도 탐지한다', () => {
    expect(detectXssAttempt('＜script＞')).toBe(true);
  });

  it('일반 텍스트(&, /, =, 따옴표)는 오탐하지 않는다', () => {
    expect(detectXssAttempt('Tom & Jerry')).toBe(false);
    expect(detectXssAttempt('path/to/file')).toBe(false);
    expect(detectXssAttempt('x = y')).toBe(false);
    expect(detectXssAttempt("O'Brien said \"hi\"")).toBe(false);
    expect(detectXssAttempt('평범한 회의록 내용')).toBe(false);
  });

  it('문자열이 아니면 false', () => {
    expect(detectXssAttempt(undefined)).toBe(false);
    expect(detectXssAttempt(123 as unknown)).toBe(false);
  });
});

// 회귀: 검증기가 탐지 결과를 결과 객체에 실어 핸들러로 올려주는지.
describe('validateUpdateNoteData - xssDetections 노출', () => {
  it('주입이 있는 segment payload는 xssDetections를 반환한다', () => {
    const result = validateUpdateNoteData({
      noteId: '123',
      type: 'segment',
      segmentId: '5',
      payload: '<img src=x onerror=alert(1)>',
      updatedBy: '1',
    });
    expect(result.success).toBe(true);
    expect(result.xssDetections).toBeDefined();
    expect(result.xssDetections![0].field).toBe('payload.segment');
  });

  it('일반 텍스트 segment는 xssDetections가 없다 (오탐 방지)', () => {
    const result = validateUpdateNoteData({
      noteId: '123',
      type: 'segment',
      segmentId: '5',
      payload: 'Tom & Jerry a/b x=y',
      updatedBy: '1',
    });
    expect(result.success).toBe(true);
    expect(result.xssDetections).toBeUndefined();
  });

  it('summary_text title의 주입도 탐지해 노출한다', () => {
    const result = validateUpdateNoteData({
      noteId: '123',
      type: 'summary_text',
      sectionId: '2',
      payload: { title: '<script>x</script>', content: 'ok' },
      updatedBy: '1',
    });
    expect(result.success).toBe(true);
    expect(result.xssDetections?.some((d) => d.field === 'payload.title')).toBe(true);
  });
});

// H-1 회귀: sanitizeXss가 HTML 엔티티 이스케이프를 하지 않아야 한다. 프론트와
// 이중으로 이스케이프하면 편집할수록 &amp;amp; → &amp;amp;amp;amp; 로 본문이
// 지수적으로 손상됐다. 렌더는 React 텍스트 노드가 담당하므로 저장 값은 원본 유지.
describe('sanitizeXss - 이중 이스케이프 제거 (H-1)', () => {
  it('& " < > \' 를 HTML 엔티티로 이스케이프하지 않는다', () => {
    expect(sanitizeXss('a & b')).toBe('a & b');
    expect(sanitizeXss('"인용" \'따옴표\'')).toBe('"인용" \'따옴표\'');
    expect(sanitizeXss('x = y')).toBe('x = y');
    expect(sanitizeXss('path/to/file')).toBe('path/to/file');
  });

  it('이미 이스케이프된 문자열을 다시 이스케이프하지 않는다(멱등)', () => {
    expect(sanitizeXss('a &amp; b')).toBe('a &amp; b');
  });

  it('손상 없는 정규화 방어는 유지한다(위험 URL 스킴 무효화)', () => {
    expect(sanitizeXss('javascript:alert(1)')).toBe('x-blocked:alert(1)');
  });
});

// H 회귀: setSpeaker sanitizedData 화이트리스트 재조립. 과거 ...data 스프레드는
// payload 밖 임의 필드를 그대로 룸+Redis pub/sub로 브로드캐스트해 트래픽을 증폭했다.
describe('validateSetSpeakerData - 화이트리스트 재조립 (H)', () => {
  const validAdd = {
    noteId: '123',
    type: 'add' as const,
    updatedBy: '1',
    payload: { speakerId: 'sp_0', name: 'Alice' },
  };

  it('payload 밖 미검증 필드는 sanitizedData에서 제거된다', () => {
    const result = validateSetSpeakerData({
      ...validAdd,
      evil: 'x'.repeat(1000),      // payload 크기 검증을 우회하는 증폭 필드
    });
    expect(result.success).toBe(true);
    const keys = Object.keys(result.sanitizedData as object).sort();
    expect(keys).toEqual(['noteId', 'payload', 'type', 'updatedBy']);
    expect((result.sanitizedData as any).evil).toBeUndefined();
  });

  it('식별자 필드가 과도하게 길면 거부한다(알려진 필드 증폭 차단)', () => {
    const result = validateSetSpeakerData({ ...validAdd, updatedBy: 'a'.repeat(65) });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.INVALID_DATA_LENGTH);
  });

  it('정상 add 메시지는 통과하고 화이트리스트 필드만 남는다', () => {
    const result = validateSetSpeakerData({ ...validAdd, segmentId: '5', timestamp: 100 });
    expect(result.success).toBe(true);
    const keys = Object.keys(result.sanitizedData as object).sort();
    expect(keys).toEqual(['noteId', 'payload', 'segmentId', 'timestamp', 'type', 'updatedBy']);
  });
});
