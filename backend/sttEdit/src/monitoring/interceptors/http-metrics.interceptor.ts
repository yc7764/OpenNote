import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { PrometheusService } from '../prometheus.service';
import { normalizePath } from '../utils/path-normalizer';

/**
 * HTTP 메트릭 인터셉터
 *
 * Django의 PrometheusBeforeMiddleware/PrometheusAfterMiddleware 패턴과 유사하게
 * 모든 HTTP 요청의 메트릭을 자동으로 수집합니다.
 *
 * 수집 메트릭:
 * - sttedit_http_requests_total: 요청 수 (method, path, status)
 * - sttedit_http_request_duration_seconds: 요청 처리 시간
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly prometheusService: PrometheusService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // WebSocket 요청은 건너뜀
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // /metrics 엔드포인트는 메트릭에서 제외 (재귀 방지)
    // startsWith 사용으로 /metrics, /metrics/, /metrics?query 등 모두 제외
    if (request.path.startsWith('/metrics')) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.recordMetrics(request, response.statusCode, startTime);
      }),
      catchError((error) => {
        // 에러 발생 시에도 메트릭 기록
        const statusCode = error.status || error.statusCode || 500;
        this.recordMetrics(request, statusCode, startTime);
        throw error;
      }),
    );
  }

  private recordMetrics(
    request: Request,
    statusCode: number,
    startTime: number,
  ): void {
    const durationSeconds = (Date.now() - startTime) / 1000;
    const path = this.getRoutePath(request);

    this.prometheusService.recordHttpRequest(
      request.method,
      path,
      statusCode,
      durationSeconds,
    );
  }

  /**
   * 경로 패턴 추출 (동적 파라미터를 플레이스홀더로 변환)
   */
  private getRoutePath(request: Request): string {
    // NestJS 라우트 경로가 있으면 사용
    const route = (request as unknown as { route?: { path?: string } }).route;
    if (route?.path) {
      return route.path;
    }

    // 없으면 실제 URL 경로 사용 (정규화 필요)
    return normalizePath(request.path);
  }
}
