import { NotFoundException } from '@nestjs/common';
import type * as express from 'express';
import { createContentETag } from '../common/http-cache.utils';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { AudiobooksController } from './audiobooks.controller';
import type { AudiobooksService } from './audiobooks.service';

function createMockResponse() {
  const response = {
    setHeader: jest.fn(),
    status: jest.fn(),
    end: jest.fn(),
  };
  response.status.mockReturnValue(response);
  response.end.mockReturnValue(response);
  return response as unknown as express.Response;
}

describe('AudiobooksController getCover', () => {
  const user = { id: 'user-1' } as AuthenticatedUser;

  function createController(
    cover: Awaited<ReturnType<AudiobooksService['getCover']>>,
  ) {
    const service = {
      verifyNotBlacklisted: jest.fn().mockResolvedValue(undefined),
      getCover: jest.fn().mockResolvedValue(cover),
    } as unknown as AudiobooksService;

    return {
      controller: new AudiobooksController(service),
      service,
    };
  }

  it('marks missing covers as no-store', async () => {
    const { controller } = createController(null);
    const res = createMockResponse();

    await expect(
      controller.getCover('book-1', undefined, res, user),
    ).rejects.toThrow(NotFoundException);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('returns 304 when If-None-Match matches the current cover ETag', async () => {
    const data = Buffer.from('current-cover');
    const etag = createContentETag(data);
    const { controller } = createController({
      data,
      mimeType: 'image/jpeg',
      lastModified: new Date('2026-01-01T00:00:00.000Z'),
    });
    const res = createMockResponse();

    await controller.getCover('book-1', etag, res, user);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-cache',
    );
    expect(res.setHeader).toHaveBeenCalledWith('ETag', etag);
    expect(res.status).toHaveBeenCalledWith(304);
    expect(res.end).toHaveBeenCalledWith();
    expect(res.setHeader).not.toHaveBeenCalledWith(
      'Content-Type',
      'image/jpeg',
    );
  });

  it('returns image bytes when If-None-Match is stale', async () => {
    const data = Buffer.from('new-cover');
    const { controller } = createController({
      data,
      mimeType: 'image/jpeg',
      lastModified: null,
    });
    const res = createMockResponse();

    await controller.getCover('book-1', '"old-etag"', res, user);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Length',
      data.length.toString(),
    );
    expect(res.end).toHaveBeenCalledWith(data);
  });
});
