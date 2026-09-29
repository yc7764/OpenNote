import { kstDayRange } from './kst-date.util';

describe('kstDayRange — 프로세스 TZ와 무관한 KST 하루 경계', () => {
  // UTC 2026-01-08 20:00 = KST 2026-01-09 05:00 (새벽 크론 시각대)
  const cronMoment = new Date('2026-01-08T20:00:00.000Z');

  it('KST 새벽에 실행해도 "어제"는 KST 달력 기준 어제 하루 전체다', () => {
    const { start, end } = kstDayRange(1, cronMoment);
    // KST 2026-01-08 00:00 = UTC 2026-01-07 15:00
    expect(start.toISOString()).toBe('2026-01-07T15:00:00.000Z');
    // KST 2026-01-08 23:59:59.999 = UTC 2026-01-08 14:59:59.999
    expect(end.toISOString()).toBe('2026-01-08T14:59:59.999Z');
  });

  it('daysAgo=0은 KST 오늘 자정부터 시작한다 (중복 방지 체크 기준)', () => {
    const { start } = kstDayRange(0, cronMoment);
    // KST 2026-01-09 00:00 = UTC 2026-01-08 15:00
    expect(start.toISOString()).toBe('2026-01-08T15:00:00.000Z');
  });

  it('UTC 날짜와 KST 날짜가 갈리는 시각(UTC 저녁)에도 KST 달력을 따른다', () => {
    // UTC 2026-03-31 16:30 = KST 2026-04-01 01:30 — KST는 이미 4월
    const t = new Date('2026-03-31T16:30:00.000Z');
    const { start, end } = kstDayRange(1, t);
    // KST 어제 = 2026-03-31 → UTC 2026-03-30 15:00 ~ 03-31 14:59:59.999
    expect(start.toISOString()).toBe('2026-03-30T15:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-31T14:59:59.999Z');
  });

  it('월 경계(KST 1일 새벽)에서 어제는 전월 말일이다', () => {
    // KST 2026-02-01 02:00 = UTC 2026-01-31 17:00
    const t = new Date('2026-01-31T17:00:00.000Z');
    const { start, end } = kstDayRange(1, t);
    // KST 어제 = 2026-01-31
    expect(start.toISOString()).toBe('2026-01-30T15:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-31T14:59:59.999Z');
  });

  it('구버전 버그 재현 방지 — UTC 프로세스의 setHours(0,0,0,0) 경계와 다르다', () => {
    const { start } = kstDayRange(1, cronMoment);
    // 구버전(UTC 기준)이라면 어제 시작이 UTC 2026-01-07 00:00 — 15시간 이른 값
    expect(start.toISOString()).not.toBe('2026-01-07T00:00:00.000Z');
  });
});
