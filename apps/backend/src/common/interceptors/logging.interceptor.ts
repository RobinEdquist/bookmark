import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, originalUrl } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          this.log(method, originalUrl, statusCode, duration);
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;
          this.log(method, originalUrl, statusCode, duration);
        },
      }),
    );
  }

  private log(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
  ): void {
    // Simple format for now, easily replaceable with structured logging later
    this.logger.log(`${method} ${path} ${statusCode} - ${duration}ms`);
  }
}
