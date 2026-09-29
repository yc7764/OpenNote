import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrometheusService } from './prometheus.service';
import { MetricsController } from './metrics.controller';
import { SecurityLoggerService } from '../common/logger/security-logger.service';
import { MetricsIpGuard } from './guards/metrics-ip.guard';

/**
 * 모니터링 모듈
 *
 * Prometheus 메트릭 및 보안 로깅을 제공하는 글로벌 모듈입니다.
 * Global 데코레이터로 인해 다른 모듈에서 import 없이 사용 가능합니다.
 *
 * 제공 서비스:
 * - PrometheusService: 메트릭 수집 및 /metrics 엔드포인트
 * - SecurityLoggerService: 보안 이벤트 로깅
 * - MetricsIpGuard: /metrics 엔드포인트 IP 화이트리스트 보호
 *
 * 환경 변수:
 * - METRICS_ALLOWED_IPS: 메트릭 엔드포인트 접근 허용 IP (기본: 127.0.0.1,::1)
 * - METRICS_ENABLED: 메트릭 엔드포인트 활성화 여부 (기본: true)
 */
@Global()
@Module({
  imports: [ConfigModule],
  controllers: [MetricsController],
  providers: [PrometheusService, SecurityLoggerService, MetricsIpGuard],
  exports: [PrometheusService, SecurityLoggerService],
})
export class MonitoringModule {}
