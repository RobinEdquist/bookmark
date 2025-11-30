import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppEventsService } from './app-events.service';
import { EventsGateway } from './events.gateway';
import { WsEventsService } from './ws-events.service';

@Global() // Make event services available throughout the app
@Module({
  imports: [ConfigModule],
  providers: [AppEventsService, EventsGateway, WsEventsService],
  exports: [AppEventsService, WsEventsService],
})
export class EventsModule {}
