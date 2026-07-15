import {
  ArgumentsHost,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockReply: jest.Mock;
  let mockLoggerError: jest.Mock;
  let host: ArgumentsHost;

  const request = { method: 'GET', url: '/api/audiobooks/123' };
  const response = {};

  beforeEach(() => {
    mockReply = jest.fn();
    mockLoggerError = jest.fn();

    const httpAdapterHost = {
      httpAdapter: { reply: mockReply },
    } as unknown as HttpAdapterHost;
    const logger = { error: mockLoggerError } as unknown as PinoLogger;

    filter = new AllExceptionsFilter(httpAdapterHost, logger);

    host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
  });

  it('sends the default NestJS body for an HttpException and skips logging 4xx', () => {
    filter.catch(new NotFoundException('Audiobook not found'), host);

    expect(mockReply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({
        statusCode: 404,
        message: 'Audiobook not found',
      }),
      404,
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('preserves object bodies from HttpExceptions (validation errors)', () => {
    const exception = new BadRequestException({
      statusCode: 400,
      message: ['title should not be empty'],
      error: 'Bad Request',
    });

    filter.catch(exception, host);

    expect(mockReply).toHaveBeenCalledWith(
      response,
      {
        statusCode: 400,
        message: ['title should not be empty'],
        error: 'Bad Request',
      },
      400,
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('logs 5xx HttpExceptions with request context', () => {
    filter.catch(new InternalServerErrorException('Sync failed'), host);

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/api/audiobooks/123',
        statusCode: 500,
      }),
      'GET /api/audiobooks/123 failed with 500',
    );
    expect(mockReply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ statusCode: 500, message: 'Sync failed' }),
      500,
    );
  });

  it('logs unknown errors with their stack and responds with a generic 500', () => {
    const error = new Error('Goodreads search failed with status 202');

    filter.catch(error, host);

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, statusCode: 500 }),
      'GET /api/audiobooks/123 failed with 500',
    );
    expect(mockReply).toHaveBeenCalledWith(
      response,
      { statusCode: 500, message: 'Internal server error' },
      500,
    );
  });

  it('rethrows for non-HTTP contexts', () => {
    const wsHost = { getType: () => 'ws' } as unknown as ArgumentsHost;
    const error = new Error('ws error');

    expect(() => filter.catch(error, wsHost)).toThrow(error);
    expect(mockReply).not.toHaveBeenCalled();
  });
});
