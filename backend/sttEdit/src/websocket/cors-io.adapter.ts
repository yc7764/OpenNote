import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * WebSocket CORS를 부트스트랩에서 ConfigService로 주입하는 어댑터.
 *
 * 기존에는 @WebSocketGateway 데코레이터의 cors가 모듈 import(데코레이터 평가) 시점에
 * process.env를 직접 읽었다. .env 파일만 쓰고 ConfigModule로 로딩하는 환경에서는 그 시점에
 * ALLOWED_ORIGINS가 아직 process.env에 없어 localhost 폴백이 적용 → 프로덕션 WS CORS가
 * 깨질 수 있었다. 어댑터의 createIOServer는 앱 부팅 이후 실행되므로 ConfigService에서
 * 안정적으로 값을 읽는다. main.ts의 HTTP CORS와 동일 정책을 사용한다.
 */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const allowedOrigins = this.configService.get<string>('ALLOWED_ORIGINS');
    const cors = {
      // 미설정 시 전체 허용(true) 대신 거부(false) — credentials와 결합된 전체 허용 방지
      origin: allowedOrigins ? allowedOrigins.split(',') : false,
      credentials: true, // HttpOnly 쿠키 전송을 위해 필수
    };
    return super.createIOServer(port, { ...options, cors });
  }
}
