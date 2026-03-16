import { ImportErrorsService } from '../import-errors.service';
import * as schema from '../schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: any = []) {
  const self: Record<string, jest.Mock> = {};
  const methods = [
    'from',
    'where',
    'limit',
    'orderBy',
    'offset',
    'set',
    'values',
    'returning',
  ];
  for (const m of methods) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  (self as any).then = (resolve: any, reject: any) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return self;
}

function createMockDb(overrides: Record<string, any> = {}) {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as any;
}

const ERROR_ID = 'err-1';
const USER_ID = 'user-1';
const FILE_PATH = '/library/Author/Book/file.m4b';

const mockError = {
  id: ERROR_ID,
  filePath: FILE_PATH,
  errorMessage: 'Parse error',
  errorCode: 'PARSE_FAILED',
  errorDetails: { stack: 'Error: Parse error\n  at ...' },
  status: 'pending',
  attemptCount: 1,
  lastOccurredAt: new Date(),
  resolvedAt: null,
  ignoredAt: null,
  ignoredBy: null,
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImportErrorsService', () => {
  // -----------------------------------------------------------------------
  // recordError
  // -----------------------------------------------------------------------
  describe('recordError', () => {
    it('creates a new record when no existing error for the file path', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);

      const insertChain = chainMock(undefined);
      const insert = jest.fn().mockReturnValue(insertChain);

      const db = createMockDb({ select, insert });
      const service = new ImportErrorsService(db);

      const error = new Error('Parse error');
      await service.recordError(FILE_PATH, error, 'PARSE_FAILED');

      expect(insert).toHaveBeenCalledWith(schema.importErrors);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: FILE_PATH,
          errorMessage: 'Parse error',
          errorCode: 'PARSE_FAILED',
        }),
      );
    });

    it('updates existing record and increments attemptCount when error already exists', async () => {
      const selectChain = chainMock([mockError]);
      const select = jest.fn().mockReturnValue(selectChain);

      const updateChain = chainMock(undefined);
      const update = jest.fn().mockReturnValue(updateChain);

      const db = createMockDb({ select, update });
      const service = new ImportErrorsService(db);

      const error = new Error('Parse error again');
      await service.recordError(FILE_PATH, error);

      expect(update).toHaveBeenCalledWith(schema.importErrors);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: 'Parse error again',
          status: 'pending',
        }),
      );
    });

    it('stores error stack in errorDetails', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);

      const insertChain = chainMock(undefined);
      const insert = jest.fn().mockReturnValue(insertChain);

      const db = createMockDb({ select, insert });
      const service = new ImportErrorsService(db);

      const error = new Error('Something broke');
      error.stack = 'Error: Something broke\n  at test.ts:1';
      await service.recordError(FILE_PATH, error);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          errorDetails: { stack: 'Error: Something broke\n  at test.ts:1' },
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getErrors
  // -----------------------------------------------------------------------
  describe('getErrors', () => {
    it('returns pending and retrying errors by default (no status filter)', async () => {
      const errors = [mockError];
      const selectChain = chainMock(errors);
      const countChain = chainMock([{ count: 1 }]);

      const select = jest
        .fn()
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(countChain);

      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getErrors();

      expect(result.errors).toEqual(errors);
      expect(result.total).toBe(1);
    });

    it('filters by specific status when provided', async () => {
      const selectChain = chainMock([]);
      const countChain = chainMock([{ count: 0 }]);

      const select = jest
        .fn()
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(countChain);

      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getErrors({ status: 'ignored' });

      expect(result.errors).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('applies limit and offset when provided', async () => {
      const selectChain = chainMock([mockError]);
      const countChain = chainMock([{ count: 5 }]);

      const select = jest
        .fn()
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(countChain);

      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getErrors({ limit: 10, offset: 2 });

      expect(result.errors).toEqual([mockError]);
      expect(result.total).toBe(5);
      expect(selectChain.limit).toHaveBeenCalledWith(10);
      expect(selectChain.offset).toHaveBeenCalledWith(2);
    });

    it('does not apply limit/offset when limit is undefined', async () => {
      const selectChain = chainMock([]);
      const countChain = chainMock([{ count: 0 }]);

      const select = jest
        .fn()
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(countChain);

      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      await service.getErrors({ offset: 5 });

      // limit not called because limit is undefined
      expect(selectChain.limit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getError
  // -----------------------------------------------------------------------
  describe('getError', () => {
    it('returns the error when found', async () => {
      const selectChain = chainMock([mockError]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getError(ERROR_ID);

      expect(result).toEqual(mockError);
    });

    it('returns null when error is not found', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getError('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // markRetrying
  // -----------------------------------------------------------------------
  describe('markRetrying', () => {
    it('updates status to retrying', async () => {
      const updateChain = chainMock(undefined);
      const update = jest.fn().mockReturnValue(updateChain);
      const db = createMockDb({ update });
      const service = new ImportErrorsService(db);

      await service.markRetrying(ERROR_ID);

      expect(update).toHaveBeenCalledWith(schema.importErrors);
      expect(updateChain.set).toHaveBeenCalledWith({ status: 'retrying' });
    });
  });

  // -----------------------------------------------------------------------
  // markResolved
  // -----------------------------------------------------------------------
  describe('markResolved', () => {
    it('updates status to resolved with resolvedAt timestamp', async () => {
      const updateChain = chainMock(undefined);
      const update = jest.fn().mockReturnValue(updateChain);
      const db = createMockDb({ update });
      const service = new ImportErrorsService(db);

      await service.markResolved(ERROR_ID);

      expect(update).toHaveBeenCalledWith(schema.importErrors);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'resolved',
          resolvedAt: expect.any(Date),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // markIgnored
  // -----------------------------------------------------------------------
  describe('markIgnored', () => {
    it('updates status to ignored with ignoredAt and ignoredBy', async () => {
      const updateChain = chainMock(undefined);
      const update = jest.fn().mockReturnValue(updateChain);
      const db = createMockDb({ update });
      const service = new ImportErrorsService(db);

      await service.markIgnored(ERROR_ID, USER_ID);

      expect(update).toHaveBeenCalledWith(schema.importErrors);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ignored',
          ignoredAt: expect.any(Date),
          ignoredBy: USER_ID,
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // deleteError
  // -----------------------------------------------------------------------
  describe('deleteError', () => {
    it('deletes the error record', async () => {
      const deleteChain = chainMock(undefined);
      const del = jest.fn().mockReturnValue(deleteChain);
      const db = createMockDb({ delete: del });
      const service = new ImportErrorsService(db);

      await service.deleteError(ERROR_ID);

      expect(del).toHaveBeenCalledWith(schema.importErrors);
    });
  });

  // -----------------------------------------------------------------------
  // isQuarantined
  // -----------------------------------------------------------------------
  describe('isQuarantined', () => {
    it('returns true when an ignored error exists for the file path', async () => {
      const selectChain = chainMock([{ id: ERROR_ID }]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.isQuarantined(FILE_PATH);

      expect(result).toBe(true);
    });

    it('returns false when no ignored error exists for the file path', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.isQuarantined('/some/other/path');

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // clearResolvedByPath
  // -----------------------------------------------------------------------
  describe('clearResolvedByPath', () => {
    it('deletes resolved, retrying, and pending errors for the given path', async () => {
      const deleteChain = chainMock(undefined);
      const del = jest.fn().mockReturnValue(deleteChain);
      const db = createMockDb({ delete: del });
      const service = new ImportErrorsService(db);

      await service.clearResolvedByPath(FILE_PATH);

      expect(del).toHaveBeenCalledWith(schema.importErrors);
    });
  });

  // -----------------------------------------------------------------------
  // getLibraryPath
  // -----------------------------------------------------------------------
  describe('getLibraryPath', () => {
    it('returns the audiobook library path for audiobook type', async () => {
      const selectChain = chainMock([
        {
          audiobookLibraryPath: '/media/audiobooks',
          ebookLibraryPath: '/media/ebooks',
        },
      ]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getLibraryPath('audiobook');

      expect(result).toBe('/media/audiobooks');
    });

    it('returns the ebook library path for ebook type', async () => {
      const selectChain = chainMock([
        {
          audiobookLibraryPath: '/media/audiobooks',
          ebookLibraryPath: '/media/ebooks',
        },
      ]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getLibraryPath('ebook');

      expect(result).toBe('/media/ebooks');
    });

    it('returns null when no settings exist', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getLibraryPath('audiobook');

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getLibraryTypeForPath
  // -----------------------------------------------------------------------
  describe('getLibraryTypeForPath', () => {
    it('returns audiobook when file path starts with audiobook library path', async () => {
      const selectChain = chainMock([
        {
          audiobookLibraryPath: '/media/audiobooks',
          ebookLibraryPath: '/media/ebooks',
        },
      ]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getLibraryTypeForPath(
        '/media/audiobooks/Author/Book/file.m4b',
      );

      expect(result).toBe('audiobook');
    });

    it('returns ebook when file path starts with ebook library path', async () => {
      const selectChain = chainMock([
        {
          audiobookLibraryPath: '/media/audiobooks',
          ebookLibraryPath: '/media/ebooks',
        },
      ]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getLibraryTypeForPath(
        '/media/ebooks/Author/Book.epub',
      );

      expect(result).toBe('ebook');
    });

    it('returns null when file path does not match any library', async () => {
      const selectChain = chainMock([
        {
          audiobookLibraryPath: '/media/audiobooks',
          ebookLibraryPath: '/media/ebooks',
        },
      ]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getLibraryTypeForPath(
        '/other/path/file.m4b',
      );

      expect(result).toBeNull();
    });

    it('returns null when no settings exist', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ImportErrorsService(db);

      const result = await service.getLibraryTypeForPath(FILE_PATH);

      expect(result).toBeNull();
    });
  });
});
