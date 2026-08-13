import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { redactUrl } from '../log-redaction.util';

/**
 * Global catch-all exception filter.
 *
 * NestJS's default exception layer sends the right response but never logs
 * HttpExceptions, so 500s thrown by services were invisible in the logs
 * (only pino-http's "request completed" line with statusCode 500 appeared,
 * without the actual error). This filter logs every 5xx — and every
 * non-HttpException — with its stack trace and request context, then sends
 * the same response body NestJS would have sent by default, so the API
 * contract is unchanged.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{
      method?: string;
      url?: string;
      session?: { user?: { id: string; email: string } };
      apiTokenUser?: { id: string; email: string };
    }>();
    const response = ctx.getResponse();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Mirror NestJS's default response shape exactly.
    let body: unknown;
    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      body =
        typeof exceptionResponse === 'string'
          ? { statusCode: status, message: exceptionResponse }
          : exceptionResponse;
    } else {
      body = { statusCode: status, message: 'Internal server error' };
    }

    if (status >= 500 || !isHttpException) {
      const user = request.session?.user || request.apiTokenUser;
      // Redacted: URLs may carry credential query params (tokens, OAuth codes)
      const url = redactUrl(request.url);
      this.logger.error(
        {
          err: exception,
          method: request.method,
          url,
          statusCode: status,
          actor: user
            ? { id: user.id, email: user.email }
            : { id: 'system', email: null },
        },
        `${request.method} ${url} failed with ${status}`,
      );
    }

    httpAdapter.reply(response, body, status);
  }
}
