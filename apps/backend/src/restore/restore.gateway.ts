import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { RestoreImporterService } from './restore-importer.service';
import { RestoreProgress } from './types/restore-session.types';

interface SocketWithSession extends Socket {
  data: {
    session?: {
      user: {
        id: string;
        email: string;
        role?: string | null;
      };
    };
    subscribedSessions?: Set<string>;
  };
}

/**
 * WebSocket gateway for real-time restore progress updates
 */
@WebSocketGateway({
  namespace: '/restore',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RestoreGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger('RestoreGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly restoreImporterService: RestoreImporterService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Restore WebSocket Gateway initialized');

    // Authentication middleware
    server.use(async (socket: SocketWithSession, next) => {
      try {
        const sessionData = await this.validateSession(socket);
        if (!sessionData) {
          this.logger.warn(`WebSocket connection rejected: invalid session`);
          return next(new Error('Invalid session'));
        }

        // Only allow admin users
        if (sessionData.user.role !== 'admin') {
          this.logger.warn(
            `WebSocket connection rejected: user ${sessionData.user.id} is not an admin`,
          );
          return next(new Error('Admin access required'));
        }

        socket.data.session = sessionData;
        socket.data.subscribedSessions = new Set<string>();
        next();
      } catch (error) {
        this.logger.error('WebSocket auth error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Subscribe to restore events from the importer service
    this.restoreImporterService.on('restore.progress', (progress: RestoreProgress) => {
      this.handleProgressUpdate(progress);
    });

    this.restoreImporterService.on(
      'restore.completed',
      (data: { sessionId: string }) => {
        this.handleRestoreCompleted(data.sessionId);
      },
    );

    this.restoreImporterService.on(
      'restore.failed',
      (data: { sessionId: string; error: string }) => {
        this.handleRestoreFailed(data.sessionId, data.error);
      },
    );
  }

  private async validateSession(
    socket: Socket,
  ): Promise<SocketWithSession['data']['session'] | null> {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      this.logger.debug('No cookie header in WebSocket handshake');
      return null;
    }

    // Create a mock request with headers for better-auth to parse
    const mockHeaders = new Headers();
    mockHeaders.set('cookie', cookieHeader);

    try {
      // Use better-auth's API to get the session
      const session = await this.authService.api.getSession({
        headers: mockHeaders,
      });

      if (!session) {
        this.logger.debug('No valid session found');
        return null;
      }

      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          role: (session.user as { role?: string }).role || null,
        },
      };
    } catch (error) {
      this.logger.error('Session validation error:', error);
      return null;
    }
  }

  handleConnection(client: SocketWithSession) {
    const userId = client.data.session?.user?.id;
    this.logger.log(`Client connected to restore namespace: ${client.id} (user: ${userId})`);
  }

  handleDisconnect(client: SocketWithSession) {
    this.logger.log(`Client disconnected from restore namespace: ${client.id}`);
  }

  /**
   * Client subscribes to updates for a specific restore session
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    client: SocketWithSession,
    payload: { sessionId: string },
  ): { success: boolean; message: string } {
    const sessionId = payload.sessionId;

    if (!sessionId) {
      return {
        success: false,
        message: 'Session ID is required',
      };
    }

    // Add to client's subscription set
    client.data.subscribedSessions = client.data.subscribedSessions || new Set<string>();
    client.data.subscribedSessions.add(sessionId);

    // Join room for this session
    client.join(`session:${sessionId}`);

    this.logger.log(
      `Client ${client.id} subscribed to session ${sessionId} (total: ${client.data.subscribedSessions.size})`,
    );

    return {
      success: true,
      message: `Subscribed to session ${sessionId}`,
    };
  }

  /**
   * Client unsubscribes from a specific restore session
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    client: SocketWithSession,
    payload: { sessionId: string },
  ): { success: boolean; message: string } {
    const sessionId = payload.sessionId;

    if (!sessionId) {
      return {
        success: false,
        message: 'Session ID is required',
      };
    }

    // Remove from client's subscription set
    if (client.data.subscribedSessions) {
      client.data.subscribedSessions.delete(sessionId);
    }

    // Leave room for this session
    client.leave(`session:${sessionId}`);

    this.logger.log(`Client ${client.id} unsubscribed from session ${sessionId}`);

    return {
      success: true,
      message: `Unsubscribed from session ${sessionId}`,
    };
  }

  /**
   * Handle progress update from RestoreImporterService
   */
  private handleProgressUpdate(progress: RestoreProgress): void {
    // Send progress to clients subscribed to this session
    this.server.to(`session:${progress.sessionId}`).emit('restore.progress', progress);
    this.logger.debug(
      `Progress update for session ${progress.sessionId}: ${progress.currentOperation} (${progress.percentage}%)`,
    );
  }

  /**
   * Handle restore completion
   */
  private handleRestoreCompleted(sessionId: string): void {
    this.server.to(`session:${sessionId}`).emit('restore.completed', { sessionId });
    this.logger.log(`Restore completed for session ${sessionId}`);
  }

  /**
   * Handle restore failure
   */
  private handleRestoreFailed(sessionId: string, error: string): void {
    this.server.to(`session:${sessionId}`).emit('restore.failed', {
      sessionId,
      error,
    });
    this.logger.log(`Restore failed for session ${sessionId}: ${error}`);
  }

  /**
   * Get the number of connected clients
   */
  getConnectedCount(): number {
    return this.server?.engine?.clientsCount || 0;
  }
}
