import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      // 와일드카드 이벤트 지원 (예: 'note.*')
      wildcard: false,
      // 에러 발생 시 예외 throw
      ignoreErrors: false,
    }),
  ],
  exports: [EventEmitterModule],
})
export class EventsModule {}
