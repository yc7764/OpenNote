import { Controller, Get, Res, UseGuards, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { PrometheusService } from './prometheus.service';
import { MetricsIpGuard } from './guards/metrics-ip.guard';

/**
 * Prometheus 메트릭 엔드포인트 컨트롤러
 *
 * Django의 django-prometheus /metrics 엔드포인트와 동일한 역할을 합니다.
 * Prometheus가 이 엔드포인트를 스크레이핑하여 메트릭을 수집합니다.
 *
 * 보안:
 * - MetricsIpGuard로 허용된 IP만 접근 가능
 * - METRICS_ALLOWED_IPS 환경변수로 허용 IP 설정
 */
@Controller('metrics')
@UseGuards(MetricsIpGuard)
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(private readonly prometheusService: PrometheusService) {}

  /**
   * GET /metrics
   *
   * Prometheus 형식으로 모든 메트릭을 반환합니다.
   * Content-Type은 Prometheus가 기대하는 형식 (text/plain; version=0.0.4)
   */
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    try {
      const metrics = await this.prometheusService.getMetrics();
      const contentType = this.prometheusService.getContentType();

      res.set('Content-Type', contentType);
      res.send(metrics);
    } catch (error) {
      this.logger.error('Failed to collect metrics', error);
      res.status(500).send('# Error collecting metrics\n');
    }
  }
}
