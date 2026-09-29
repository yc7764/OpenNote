import { Logger } from '@nestjs/common';

const logger = new Logger('PathNormalizer');

/**
 * 16진수처럼 보이지만 실제 엔드포인트 이름인 경로들
 * (8자 이상의 hex 문자열이지만 :id로 변환하지 않아야 하는 경로)
 */
const HEX_LIKE_ENDPOINT_WHITELIST = [
  'deadbeef', // 예시: /api/deadbeef (실제 엔드포인트)
  'cafebabe', // 예시: /api/cafebabe (실제 엔드포인트)
  // 프로젝트에 hex처럼 보이는 실제 엔드포인트가 있다면 여기 추가
];

/**
 * 경로 정규화 유틸리티
 *
 * Prometheus 메트릭의 카디널리티 폭발을 방지하기 위해
 * HTTP 요청 경로를 정규화합니다.
 *
 * 처리 과정:
 * 1. 쿼리 스트링과 fragment 제거
 * 2. URL 디코딩 (이중 인코딩 방지, 최대 2회)
 * 3. 경로 탐색 공격 방지 (../ 제거)
 * 4. 연속 슬래시 정규화
 * 5. UUID 패턴 → :id
 * 6. 긴 16진수 문자열 → :id
 * 7. 숫자 ID → :id
 * 8. 경로 길이 제한 (80자)
 *
 * @param path - 정규화할 HTTP 경로
 * @returns 정규화된 경로
 *
 * @example
 * normalizePath('/api/users/123') // '/api/users/:id'
 * normalizePath('/api/notes/abc-def-ghi-jkl-mno') // '/api/notes/:id'
 * normalizePath('/api/data?query=1') // '/api/data'
 */
export function normalizePath(path: string): string {
  try {
    // 1. 쿼리 스트링과 fragment 제거
    let cleanPath = path.split('?')[0].split('#')[0];

    // 2. URL 인코딩 디코딩 (안전하게, 최대 2회 - 이중 인코딩 방지)
    let previousPath = '';
    let decodeAttempts = 0;
    while (cleanPath !== previousPath && decodeAttempts < 2) {
      previousPath = cleanPath;
      try {
        cleanPath = decodeURIComponent(cleanPath);
      } catch {
        // 잘못된 인코딩은 무시하고 이전 값 사용
        cleanPath = previousPath;
        break;
      }
      decodeAttempts++;
    }

    // 3. 경로 탐색 공격 방지 (../ 제거)
    cleanPath = cleanPath.replace(/\.\.+/g, '.');

    // 4. 연속 슬래시 정규화
    cleanPath = cleanPath.replace(/\/+/g, '/');

    // 5. UUID 패턴을 :id로 변환
    // UUID v4 형식: 8-4-4-4-12 (예: 550e8400-e29b-41d4-a716-446655440000)
    cleanPath = cleanPath.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':id',
    );

    // 6. 긴 16진수 문자열 (8자 이상) → :id
    // MongoDB ObjectId 등 UUID가 아닌 긴 hex 문자열 대응
    // 단, 화이트리스트에 있는 엔드포인트는 제외
    cleanPath = cleanPath.replace(/\/([0-9a-f]{8,})(?=\/|$)/gi, (match, hex) => {
      if (HEX_LIKE_ENDPOINT_WHITELIST.includes(hex.toLowerCase())) {
        return match; // 화이트리스트에 있으면 원본 유지
      }
      return '/:id'; // ID로 변환
    });

    // 7. 숫자 ID 패턴을 :id로 변환 (경로 세그먼트가 순수 숫자인 경우)
    cleanPath = cleanPath.replace(/\/\d+(?=\/|$)/g, '/:id');

    // 8. 경로 길이 제한 (cardinality 추가 방지)
    if (cleanPath.length > 80) {
      cleanPath = cleanPath.substring(0, 80);
    }

    return cleanPath;
  } catch (error) {
    // 정규화 실패 시 안전한 기본값 반환
    logger.warn(`Path normalization failed for: ${path}`, error);
    return '/unknown';
  }
}
