import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '@thallesp/nestjs-better-auth';

interface SocketWithSession extends Socket {
  data: {
    session?: {
      user: {
        id: string;
        email: string;
        role?: string | null;
      };
    };
  };
}

@WebSocketGateway({
  cors: {
    origin: true, // Will be configured via ConfigService
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    // Configure CORS with UI_URL from env
    const uiUrl = this.configService.get<string>('UI_URL');
    if (uiUrl) {
      server.engine.opts.cors = {
        origin: uiUrl,
        credentials: true,
      };
    }

    // Authentication middleware
    server.use(async (socket: SocketWithSession, next) => {
      try {
        const sessionData = await this.validateSession(socket);
        if (!sessionData) {
          this.logger.warn(`WebSocket connection rejected: invalid session`);
          return next(new Error('Invalid session'));
        }
        socket.data.session = sessionData;
        next();
      } catch (error) {
        this.logger.error('WebSocket auth error:', error);
        next(new Error('Authentication failed'));
      }
    });
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
    this.logger.log(`Client connected: ${client.id} (user: ${userId})`);

    // Join all event rooms
    client.join([
      'audiobooks',
      'series',
      'library',
      'hardcover',
      'settings',
      'tasks',
    ]);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Emit an event to all connected clients
   */
  emitToAll(event: string, payload: unknown): void {
    this.server?.emit(event, payload);
  }

  /**
   * Emit an event to clients in a specific room
   */
  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server?.to(room).emit(event, payload);
  }

  /**
   * Get the number of connected clients
   */
  getConnectedCount(): number {
    return this.server?.engine?.clientsCount || 0;
  }
}
