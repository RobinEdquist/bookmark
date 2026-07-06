import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('fs/promises', () => ({
  stat: jest.fn(),
}));

jest.mock('./import-errors.service', () => ({
  ImportErrorsService: class ImportErrorsService {},
}));

jest.mock('../library-watcher/import-queue.service', () => ({
  ImportQueueService: class ImportQueueService {},
}));

import * as fs from 'fs/promises';
import { ImportErrorsController } from './import-errors.controller';

const mockedFs = jest.mocked(fs);

function createController() {
  const importErrorsService = {
    getErrors: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getError: jest.fn().mockResolvedValue({
      id: 'error-1',
      filePath: '/library/book.epub',
    }),
    getLibraryTypeForPath: jest.fn().mockResolvedValue('ebook'),
    getLibraryPath: jest.fn().mockResolvedValue('/library'),
    markRetrying: jest.fn().mockResolvedValue(undefined),
    markIgnored: jest.fn().mockResolvedValue(undefined),
    deleteError: jest.fn().mockResolvedValue(undefined),
  };
  const importQueueService = {
    queueDirectory: jest.fn(),
    queueFile: jest.fn(),
  };

  return {
    controller: new ImportErrorsController(
      importErrorsService as any,
      importQueueService as any,
    ),
    importErrorsService,
    importQueueService,
  };
}

describe('ImportErrorsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);
  });

  it('lists errors with parsed pagination', async () => {
    const { controller, importErrorsService } = createController();

    await expect(controller.listErrors('pending', '25', '50')).resolves.toEqual(
      {
        items: [],
        total: 0,
      },
    );
    expect(importErrorsService.getErrors).toHaveBeenCalledWith({
      status: 'pending',
      limit: 25,
      offset: 50,
    });
  });

  it('returns an error by id or throws when missing', async () => {
    const { controller, importErrorsService } = createController();

    await expect(controller.getError('error-1')).resolves.toEqual({
      id: 'error-1',
      filePath: '/library/book.epub',
    });

    importErrorsService.getError.mockResolvedValue(null);
    await expect(controller.getError('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('queues file retries', async () => {
    const { controller, importErrorsService, importQueueService } =
      createController();

    await expect(controller.retryImport('error-1')).resolves.toEqual({
      success: true,
      message: 'Retry queued',
    });
    expect(importErrorsService.markRetrying).toHaveBeenCalledWith('error-1');
    expect(importQueueService.queueFile).toHaveBeenCalledWith(
      '/library/book.epub',
      '/library',
      'ebook',
    );
  });

  it('queues directory retries', async () => {
    mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
    const { controller, importQueueService } = createController();

    await controller.retryImport('error-1');

    expect(importQueueService.queueDirectory).toHaveBeenCalledWith(
      '/library/book.epub',
      '/library',
      'ebook',
    );
  });

  it('rejects retries when the error is missing', async () => {
    const { controller, importErrorsService } = createController();
    importErrorsService.getError.mockResolvedValue(null);

    await expect(controller.retryImport('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects retries when library type or path cannot be resolved', async () => {
    const { controller, importErrorsService } = createController();
    importErrorsService.getLibraryTypeForPath.mockResolvedValue(null);

    await expect(controller.retryImport('error-1')).rejects.toThrow(
      'Could not determine library type for file path',
    );

    importErrorsService.getLibraryTypeForPath.mockResolvedValue('ebook');
    importErrorsService.getLibraryPath.mockResolvedValue(null);
    await expect(controller.retryImport('error-1')).rejects.toThrow(
      'Library path not configured',
    );
  });

  it('rejects retries when the original path is gone', async () => {
    mockedFs.stat.mockRejectedValue(new Error('ENOENT'));
    const { controller } = createController();

    await expect(controller.retryImport('error-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('ignores an error as the current user', async () => {
    const { controller, importErrorsService } = createController();

    await expect(
      controller.ignoreError('error-1', { id: 'user-1' } as any),
    ).resolves.toEqual({ success: true });
    expect(importErrorsService.markIgnored).toHaveBeenCalledWith(
      'error-1',
      'user-1',
    );
  });

  it('rejects ignoring missing errors', async () => {
    const { controller, importErrorsService } = createController();
    importErrorsService.getError.mockResolvedValue(null);

    await expect(
      controller.ignoreError('missing', { id: 'user-1' } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes an error after confirming it exists', async () => {
    const { controller, importErrorsService } = createController();

    await controller.deleteError('error-1');

    expect(importErrorsService.deleteError).toHaveBeenCalledWith('error-1');
  });

  it('rejects deleting missing errors', async () => {
    const { controller, importErrorsService } = createController();
    importErrorsService.getError.mockResolvedValue(null);

    await expect(controller.deleteError('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
