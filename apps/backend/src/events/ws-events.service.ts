import { Injectable, Logger } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

export interface WSEvent {
  type: string;
  entityId?: string;
  timestamp: number;
  payload?: unknown;
}

export interface ImportTaskStatus {
  pendingCount: number;
  pendingNames: string[];
}

export interface HardcoverTaskStatus {
  pendingCount: number;
  failedCount: number;
}

@Injectable()
export class WsEventsService {
  private readonly logger = new Logger(WsEventsService.name);
  private lastImportStatusJson: string | null = null;
  private lastHardcoverStatusJson: string | null = null;

  constructor(private readonly gateway: EventsGateway) {}

  private emit(event: Omit<WSEvent, 'timestamp'>): void {
    const fullEvent: WSEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.logger.log(
      `Emitting WS event: ${fullEvent.type}${fullEvent.entityId ? ` (entityId: ${fullEvent.entityId})` : ''}`,
    );

    const room = this.getRoom(fullEvent.type);
    if (room) {
      this.gateway.emitToRoom(room, 'event', fullEvent);
    } else {
      this.gateway.emitToAll('event', fullEvent);
    }
  }

  private getRoom(eventType: string): string | null {
    if (eventType.startsWith('audiobook.')) return 'audiobooks';
    if (eventType.startsWith('ebook.')) return 'ebooks';
    if (eventType.startsWith('series.')) return 'series';
    if (eventType.startsWith('library.')) return 'library';
    if (eventType.startsWith('hardcover.')) return 'hardcover';
    if (eventType.startsWith('settings.')) return 'settings';
    if (eventType.startsWith('tasks.')) return 'tasks';
    return null;
  }

  // Audiobook events
  audiobookCreated(id: string): void {
    this.emit({ type: 'audiobook.created', entityId: id });
  }

  audiobookUpdated(id: string): void {
    this.emit({ type: 'audiobook.updated', entityId: id });
  }

  audiobookDeleted(id: string): void {
    this.emit({ type: 'audiobook.deleted', entityId: id });
  }

  // Ebook events
  ebookCreated(id: string): void {
    this.emit({ type: 'ebook.created', entityId: id });
  }

  ebookUpdated(id: string): void {
    this.emit({ type: 'ebook.updated', entityId: id });
  }

  ebookDeleted(id: string): void {
    this.emit({ type: 'ebook.deleted', entityId: id });
  }

  // Series events
  seriesCreated(id: string): void {
    this.emit({ type: 'series.created', entityId: id });
  }

  seriesUpdated(id: string): void {
    this.emit({ type: 'series.updated', entityId: id });
  }

  seriesDeleted(id: string): void {
    this.emit({ type: 'series.deleted', entityId: id });
  }

  // Library scan events
  libraryScanStarted(): void {
    this.emit({ type: 'library.scan.started' });
  }

  libraryScanCompleted(): void {
    this.emit({ type: 'library.scan.completed' });
  }

  // Hardcover events
  hardcoverSyncCompleted(audiobookId: string): void {
    this.emit({ type: 'hardcover.sync.completed', entityId: audiobookId });
  }

  // Settings events
  settingsUpdated(): void {
    this.emit({ type: 'settings.updated' });
  }

  /**
   * Push import task status update to all connected clients.
   * Debounced - only emits if status has changed.
   */
  importStatusUpdated(status: ImportTaskStatus): void {
    const statusJson = JSON.stringify(status);

    // Debounce: only emit if status actually changed
    if (statusJson === this.lastImportStatusJson) {
      return;
    }

    this.lastImportStatusJson = statusJson;
    this.emit({ type: 'tasks.import.status', payload: status });
  }

  /**
   * Push hardcover sync task status update to all connected clients.
   * Debounced - only emits if status has changed.
   */
  hardcoverSyncStatusUpdated(status: HardcoverTaskStatus): void {
    const statusJson = JSON.stringify(status);

    // Debounce: only emit if status actually changed
    if (statusJson === this.lastHardcoverStatusJson) {
      return;
    }

    this.lastHardcoverStatusJson = statusJson;
    this.emit({ type: 'tasks.hardcover.status', payload: status });
  }

  /**
   * Get the number of connected WebSocket clients
   */
  getConnectedCount(): number {
    return this.gateway.getConnectedCount();
  }
}
