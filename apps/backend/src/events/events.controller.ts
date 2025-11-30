import { Controller, Logger, Sse, UseGuards } from '@nestjs/common';
import { Observable, Subject, interval, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppEventsService, SSEEvent } from './app-events.service';
import { AuthGuard } from '../common/guards/auth.guard';

interface MessageEvent {
  data: string;
}

// Heartbeat interval in milliseconds (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

@Controller('events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly appEvents: AppEventsService) {}

  @Sse()
  @UseGuards(AuthGuard)
  stream(): Observable<MessageEvent> {
    this.logger.log('SSE client connected');
    const subject = new Subject<SSEEvent>();

    // Subscribe to app events
    const unsubscribe = this.appEvents.subscribe((event) => {
      this.logger.debug(`Sending event to client: ${event.type}`);
      subject.next(event);
    });

    // Return observable that maps events to SSE format
    return new Observable<MessageEvent>((subscriber) => {
      // Create heartbeat observable
      const heartbeat$ = interval(HEARTBEAT_INTERVAL).pipe(
        map(() => ({ data: JSON.stringify({ type: 'heartbeat' }) })),
      );

      // Create events observable
      const events$ = subject.pipe(
        map((event) => ({ data: JSON.stringify(event) })),
      );

      // Merge heartbeat and events
      const subscription = merge(heartbeat$, events$).subscribe(subscriber);

      // Cleanup on disconnect
      return () => {
        this.logger.log('SSE client disconnected');
        subscription.unsubscribe();
        unsubscribe();
        subject.complete();
      };
    });
  }
}
