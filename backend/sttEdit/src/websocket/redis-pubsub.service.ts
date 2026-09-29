import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { websocketServer } from './websocket.server';

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);

  // 구독/해제 대상 채널 패턴 (단일 소스 — init/destroy가 공유)
  private readonly channelPatterns = [
    'note:*:segments',
    'note:*:summary_text',
    'note:*:keywords',
    'note:*:next_action',
    'note:*:main_topic',
    'note:*:status',
    'note:*:speakers',
  ];

  constructor(
    private readonly redisService: RedisService,
    private readonly websocketServer: websocketServer,
  ) {}

  async onModuleInit() {
    for (const pattern of this.channelPatterns) {
      await this.redisService.psubscribe(pattern, (channel, message) => {
        this.websocketServer.handleRedisMessage(channel, message);
      });
    }

    this.logger.log('Redis pub/sub service initialized');
  }

  async onModuleDestroy() {
    for (const pattern of this.channelPatterns) {
      await this.redisService.punsubscribe(pattern);
    }
    this.logger.log('Redis pub/sub service destroyed');
  }
}
