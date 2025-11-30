import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface SSEEvent {
  type: string;
  entityId?: string;
  timestamp: number;
}

@Injectable()
export class AppEventsService {
  private readonly logger = new Logger(AppEventsService.name);
  private emitter = new EventEmitter();

  /**
   * Emit an event to all connected SSE clients
   */
  emit(event: Omit<SSEEvent, 'timestamp'>): void {
    const fullEvent: SSEEvent = {
      ...event,
      timestamp: Date.now(),
    };
    this.logger.log(
      `Emitting SSE event: ${fullEvent.type}${fullEvent.entityId ? ` (entityId: ${fullEvent.entityId})` : ''}`,
    );
    this.emitter.emit('sse', fullEvent);
  }

  /**
   * Subscribe to SSE events
   * Returns an unsubscribe function
   */
  subscribe(listener: (event: SSEEvent) => void): () => void {
    this.emitter.on('sse', listener);
    return () => this.emitter.off('sse', listener);
  }

  // Convenience methods for common events

  audiobookCreated(id: string): void {
    this.emit({ type: 'audiobook.created', entityId: id });
  }

  audiobookUpdated(id: string): void {
    this.emit({ type: 'audiobook.updated', entityId: id });
  }

  audiobookDeleted(id: string): void {
    this.emit({ type: 'audiobook.deleted', entityId: id });
  }

  seriesCreated(id: string): void {
    this.emit({ type: 'series.created', entityId: id });
  }

  seriesUpdated(id: string): void {
    this.emit({ type: 'series.updated', entityId: id });
  }

  seriesDeleted(id: string): void {
    this.emit({ type: 'series.deleted', entityId: id });
  }

  libraryScanStarted(): void {
    this.emit({ type: 'library.scan.started' });
  }

  libraryScanCompleted(): void {
    this.emit({ type: 'library.scan.completed' });
  }

  hardcoverSyncCompleted(audiobookId: string): void {
    this.emit({ type: 'hardcover.sync.completed', entityId: audiobookId });
  }

  settingsUpdated(): void {
    this.emit({ type: 'settings.updated' });
  }
}
