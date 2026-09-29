import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const Redis = require('ioredis'); // ioredis 라이브러리 로드

        // Redis 모드 선택 (CLUSTER 또는 STANDALONE)
        const redisMode = configService.get<string>('REDIS_MODE', 'CLUSTER');
        const password = configService.get<string>('REDIS_PASSWORD');

        console.log(`Redis Mode from config: ${redisMode}`);

        if (redisMode === 'STANDALONE') {
          // Standalone 모드
          const [host, port] = configService
            .get<string>('REDIS_HOST', '127.0.0.1:6379')
            .split(':');

          console.log(`Connecting to Redis in STANDALONE mode: ${host}:${port}`);

          return new Redis({
            host,
            port: parseInt(port, 10),
            password,
            maxRetriesPerRequest: 20,
            connectTimeout: 10000,
            commandTimeout: 5000,
            enableReadyCheck: true,
            enableOfflineQueue: true,
            retryStrategy: (times: number) => {
              if (times > 10) {
                console.error('Redis connection failed after 10 retries');
                return null;
              }
              const delay = Math.min(times * 100, 2000);
              console.log(`Retrying Redis connection... attempt ${times}, delay: ${delay}ms`);
              return delay;
            },
          });
        }

        // Cluster 모드 (기본값)
        const clusterNodesEnv = configService.get<string>(
          'REDIS_CLUSTER_NODES',
          '127.0.0.1:6300,127.0.0.1:6301,127.0.0.1:6302',
        );

        const startupNodes = clusterNodesEnv.split(',').map((node) => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port, 10) };
        });

        console.log(`Connecting to Redis in CLUSTER mode: ${JSON.stringify(startupNodes)}`);

        const externalHost = configService.get<string>('REDIS_EXTERNAL_HOST');

        const clusterOptions: any = {
          redisOptions: {
            maxRetriesPerRequest: 20,
            connectTimeout: 10000,
            commandTimeout: 5000,
            enableReadyCheck: true,
            enableOfflineQueue: true,
          },
          slotsRefreshTimeout: 10000,
          slotsRefreshInterval: 30000,
          maxRedirections: 16,
          clusterRetryStrategy: (times: number) => {
            if (times > 10) {
              console.error('Redis Cluster connection failed after 10 retries');
              return null;
            }
            const delay = Math.min(times * 100, 2000);
            console.log(`Retrying Redis Cluster connection... attempt ${times}, delay: ${delay}ms`);
            return delay;
          },
        };

        // NAT mapping 설정 (외부 호스트가 설정된 경우)
        if (externalHost) {
          clusterOptions.natMap = {
            '127.0.0.1:6300': { host: externalHost, port: 6300 },
            '127.0.0.1:6301': { host: externalHost, port: 6301 },
            '127.0.0.1:6302': { host: externalHost, port: 6302 },
          };
          console.log(`NAT mapping enabled: 127.0.0.1 -> ${externalHost}`);
        }

        if (password) {
          clusterOptions.redisOptions.password = password;
        }

        try {
          const cluster = new Redis.Cluster(startupNodes, clusterOptions);

          cluster.on('error', (err) => {
            console.error('Redis Cluster Error:', err.message);
          });

          cluster.on('ready', () => {
            console.log('Redis Cluster is ready');
          });

          cluster.on('connect', () => {
            console.log('Redis Cluster connected');
          });

          return cluster;
        } catch (error) {
          console.error('Failed to create Redis Cluster:', error);
          throw error;
        }
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
