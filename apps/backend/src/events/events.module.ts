import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { AppEventsService } from './app-events.service';

@Global() // Make AppEventsService available throughout the app
@Module({
  controllers: [EventsController],
  providers: [AppEventsService],
  exports: [AppEventsService],
})
export class EventsModule {}
