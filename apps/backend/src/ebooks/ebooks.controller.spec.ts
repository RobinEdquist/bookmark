import { BadRequestException, HttpStatus } from '@nestjs/common';
import type * as express from 'express';
import { PassThrough } from 'stream';
import { EbooksController } from './ebooks.controller';
import type { EbooksService } from './ebooks.service';
import type { AuthenticatedUser } from '../common/guards/auth.guard';

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    createReadStream: jest.fn(),
  };
});

import * as fs from 'fs';

const mockedCreateReadStream = jest.mocked(fs.createReadStream);

function createMockResponse() {
  const response = new PassThrough() as PassThrough & {
    setHeader: jest.Mock;
    status: jest.Mock;
    end: jest.Mock;
  };
  response.setHeader = jest.fn();
  response.status = jest.fn().mockReturnValue(response);
  // Preserve PassThrough.end but track calls for assertions.
  const endSpy = jest.fn().mockImplementation((...args: unknown[]) => {
    PassThrough.prototype.end.apply(response, args as never);
    return response;
  });
  response.end = endSpy as typeof response.end;
  return response as unknown as express.Response;
}

describe('EbooksController download/stream (PDF)', () => {
  const user = { id: 'user-1' } as AuthenticatedUser;

  function createController(
    downloadInfo: Awaited<ReturnType<EbooksService['getDownloadInfo']>>,
  ) {
    const service = {
      verifyNotBlacklisted: jest.fn().mockResolvedValue(undefined),
      getDownloadInfo: jest.fn().mockResolvedValue(downloadInfo),
    } as unknown as EbooksService;

    return {
      controller: new EbooksController(service),
      service,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    const passthrough = new PassThrough();
    mockedCreateReadStream.mockReturnValue(passthrough as any);
  });

  const pdfInfo = {
    filePath: '/library/ebooks/Textbook.pdf',
    fileName: 'Textbook.pdf',
    mimeType: 'application/pdf',
    fileSize: 1000,
  };

  it('download returns application/pdf with the original filename', async () => {
    const { controller, service } = createController(pdfInfo);
    const res = createMockResponse();

    await controller.download('ebook-1', res, user);

    expect(service.verifyNotBlacklisted).toHaveBeenCalledWith(
      'ebook-1',
      user.id,
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="Textbook.pdf"',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '1000');
    expect(mockedCreateReadStream).toHaveBeenCalledWith(pdfInfo.filePath);
  });

  it('stream enforces tag blacklist before serving', async () => {
    const { controller, service } = createController(pdfInfo);
    const res = createMockResponse();
    const req = { headers: {} } as express.Request;

    await controller.stream('ebook-1', req, res, user);

    expect(service.verifyNotBlacklisted).toHaveBeenCalledWith(
      'ebook-1',
      user.id,
    );
  });

  it('stream returns 206 with Content-Range for a valid Range header', async () => {
    const { controller } = createController(pdfInfo);
    const res = createMockResponse();
    const req = { headers: { range: 'bytes=0-99' } } as express.Request;

    await controller.stream('ebook-1', req, res, user);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.PARTIAL_CONTENT);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Range',
      'bytes 0-99/1000',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '100');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(mockedCreateReadStream).toHaveBeenCalledWith(pdfInfo.filePath, {
      start: 0,
      end: 99,
    });
  });

  it('stream returns 416 with Content-Range */size for an unsatisfiable Range', async () => {
    const { controller } = createController(pdfInfo);
    const res = createMockResponse();
    const req = { headers: { range: 'bytes=5000-6000' } } as express.Request;

    await controller.stream('ebook-1', req, res, user);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes */1000');
    expect(res.status).toHaveBeenCalledWith(
      HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
    );
    expect(res.end).toHaveBeenCalled();
    expect(mockedCreateReadStream).not.toHaveBeenCalled();
  });

  it('stream rejects non-streamable MIME types', async () => {
    const { controller } = createController({
      ...pdfInfo,
      mimeType: 'application/octet-stream',
    });
    const res = createMockResponse();
    const req = { headers: {} } as express.Request;

    await expect(controller.stream('ebook-1', req, res, user)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('download still uses epub MIME for EPUB files', async () => {
    const { controller } = createController({
      filePath: '/library/ebooks/Book.epub',
      fileName: 'Book.epub',
      mimeType: 'application/epub+zip',
      fileSize: 2000,
    });
    const res = createMockResponse();

    await controller.download('ebook-2', res, user);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/epub+zip',
    );
  });
});
