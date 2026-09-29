/**
 * KST(Asia/Seoul, UTC+9, DST 없음) 기준 날짜 경계 계산.
 *
 * 컨테이너(node:alpine)는 TZ 미설정으로 UTC로 돌기 때문에 new Date().setHours(0,0,0,0)
 * 같은 프로세스-로컬 계산은 KST 자정과 15시간 어긋난다. 크론(@Cron timeZone: 'Asia/Seoul')과
 * 날짜 구간 계산이 같은 기준을 쓰도록, 프로세스 TZ와 무관하게 KST 경계를 절대시각으로 만든다.
 */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * KST 기준 "오늘로부터 daysAgo일 전" 하루의 [시작, 끝] 절대시각.
 * 예) KST 2026-01-09 02:00에 kstDayRange(1) → 2026-01-08 00:00:00.000 ~ 23:59:59.999 KST
 *     (= UTC 2026-01-07 15:00 ~ 2026-01-08 14:59:59.999)
 */
export function kstDayRange(daysAgo: number, now: Date = new Date()): { start: Date; end: Date } {
  // KST 벽시계를 UTC 필드로 갖는 가상 시각 → getUTC*로 KST의 연/월/일을 얻는다
  const kstWall = new Date(now.getTime() + KST_OFFSET_MS);
  const startMs =
    Date.UTC(kstWall.getUTCFullYear(), kstWall.getUTCMonth(), kstWall.getUTCDate() - daysAgo) -
    KST_OFFSET_MS;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { start: new Date(startMs), end: new Date(endMs) };
}
