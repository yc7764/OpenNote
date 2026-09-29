import { readFileSync } from 'fs';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from './redis/redis.module';
import { websocketModule } from './websocket/websocket.module';
import { NoteModule } from './note/note.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { EventsModule } from './events/events.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { validate } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate,
    }),
    MonitoringModule,
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        const isProduction = nodeEnv === 'production';
        const enableSsl = configService.get<string>('DB_SSL', 'false') === 'true';
        const rejectUnauthorized =
          configService.get<string>('DB_SSL_REJECT_UNAUTHORIZED', 'true') === 'true';
        // 사설 CA로 발급한 인증서는 Node 기본 신뢰 저장소에 없다.
        // rejectUnauthorized=true인데 CA를 안 주면 연결 자체가 실패한다.
        const sslCaPath = configService.get<string>('DB_SSL_CA', '').trim();
        if (enableSsl && rejectUnauthorized && !sslCaPath) {
          throw new Error(
            'DB_SSL=true, DB_SSL_REJECT_UNAUTHORIZED=true 인데 DB_SSL_CA가 없습니다. ' +
              '사설 CA 인증서 경로를 지정하세요.',
          );
        }

        return {
          type: 'postgres',
          host: configService.get('POSTGRES_HOST'),
          port: parseInt(configService.get<string>('POSTGRES_PORT', '5432'), 10),
          username: configService.get('POSTGRES_USERNAME'),
          password: configService.get('POSTGRES_PASSWORD'),
          database: configService.get('POSTGRES_DATABASE'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false, // 프로덕션 환경에서는 false로 설정
          logging: !isProduction, // 프로덕션에서는 로깅 비활성화

          // 커넥션 풀 설정 (숫자로 명시적 변환)
          extra: {
            max: parseInt(configService.get<string>('DB_POOL_SIZE', '10'), 10),
            min: 2,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
          },

          // 재시도 설정
          retryAttempts: 3,
          retryDelay: 3000,

          // SSL 설정 (기본값 false, DB_SSL=true로 활성화)
          // rejectUnauthorized=false는 암호화만 하고 서버를 검증하지 않아
          // 중간자 공격에 무방비다. 운영에서는 CA를 지정해 검증까지 해야 한다.
          ssl: enableSsl
            ? {
                rejectUnauthorized,
                ...(sslCaPath ? { ca: readFileSync(sslCaPath, 'utf8') } : {}),
              }
            : false,
        };
      },
      inject: [ConfigService],
    }),
    EventsModule,
    RedisModule,
    websocketModule,
    NoteModule,
    SchedulerModule,
  ],
})
export class AppModule {}
