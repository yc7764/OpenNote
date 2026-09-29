import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { winstonLogger } from './config/winston.config';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { HttpMetricsInterceptor } from './monitoring/interceptors/http-metrics.interceptor';
import { PrometheusService } from './monitoring/prometheus.service';
import { CorsIoAdapter } from './websocket/cors-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLogger,
  });
  const configService = app.get(ConfigService);

  // LOW-1: 보안 헤더 (nosniff, X-Powered-By 제거 등 defense-in-depth)
  // CORS 설정 이전에 적용
  app.use(helmet());

  // CORS 설정
  const allowedOrigins = configService.get('ALLOWED_ORIGINS');
  app.enableCors({
    // fallback을 전체 허용(true)에서 거부(false)로 변경 — env 검증상 도달할 수
    // 없는 분기지만, credentials와 결합된 전체 허용이라 심층방어로 닫아둔다
    origin: allowedOrigins ? allowedOrigins.split(',') : false,
    credentials: true,
  });

  // WebSocket CORS도 데코레이터 평가 시점 process.env가 아니라
  // 부트스트랩의 ConfigService에서 읽도록 커스텀 어댑터를 등록한다
  app.useWebSocketAdapter(new CorsIoAdapter(app, configService));

  // HTTP 메트릭 인터셉터 등록 (Prometheus)
  const prometheusService = app.get(PrometheusService);
  app.useGlobalInterceptors(new HttpMetricsInterceptor(prometheusService));

  // SIGTERM/SIGINT 시 onModuleDestroy 실행 (Redis quit·pub/sub 해제·메트릭 정리)
  // 이 호출이 없으면 각 서비스의 정리 로직이 구현만 있고 실행되지 않는다
  app.enableShutdownHooks();

  const port = configService.get('PORT', 3000);
  await app.listen(port);

  Logger.log(`🚀 Server is running on port ${port}`, 'Bootstrap');
  Logger.log(`📡 WebSocket server is ready`, 'Bootstrap');
  Logger.log(`📊 Prometheus metrics available at /metrics`, 'Bootstrap');
}
bootstrap();
