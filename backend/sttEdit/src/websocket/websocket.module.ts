import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { websocketServer } from './websocket.server';
import { WebsocketConnectionService } from './websocket.connection.service';
import { RedisPubSubService } from './redis-pubsub.service';
import { RedisModule } from '../redis/redis.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Note } from '../note/entity/note.entity';

@Module({
  imports: [
    RedisModule,
    TypeOrmModule.forFeature([Note]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [websocketServer, WebsocketConnectionService, RedisPubSubService],
})
export class websocketModule {}
