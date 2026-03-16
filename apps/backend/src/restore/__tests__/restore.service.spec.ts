jest.mock('fs/promises');
jest.mock('fs', () => ({ createReadStream: jest.fn() }));
jest.mock('unzipper', () => ({ Extract: jest.fn() }));

import * as fsp from 'fs/promises';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RestoreService } from '../restore.service';
import {
  RestoreSession,
  RestoreSessionState,
} from '../types/restore-session.types';

const mockedFs = jest.mocked(fsp);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAbsParser(overrides: Record<string, any> = {}) {
  return {
    parseBackupDetails: jest.fn(),
    parseLibraryData: jest.fn(),
    getCoverPath: jest.fn(),
    getAuthorImagePath: jest.fn(),
    ...overrides,
  } as any;
}

function createMockAppData(overrides: Record<string, any> = {}) {
  return {
    getTempSessionPath: jest.fn().mockReturnValue('/tmp/test-session'),
    getAudiobookCoverPath: jest.fn(),
    getPersonImagePath: jest.fn(),
    ...overrides,
  } as any;
}

function setupSession(
  service: any,
  id: string,
  state: RestoreSessionState,
  overrides: any = {},
): RestoreSession {
  const session: RestoreSession = {
    id,
    state,
    startedAt: new Date(),
    totalItems: 0,
    processedItems: 0,
    pathMappings: [],
    userMappings: [],
    options: {
      importProgress: true,
      importCovers: true,
      importAuthorImages: true,
      overwriteExisting: false,
      lockMetadata: false,
    },
    extractedPath: '/tmp/test',
    ...overrides,
  };
  service.sessions.set(id, session);
  return session;
}

function setupParsedBackup(service: any, sessionId: string, backup: any): void {
  service.parsedBackups.set(sessionId, backup);
}

const SESSION_ID = 'session-1';
const LIBRARY_ID = 'lib-1';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RestoreService', () => {
  let absParser: any;
  let appData: any;

  beforeEach(() => {
    absParser = createMockAbsParser();
    appData = createMockAppData();
  });

  // -----------------------------------------------------------------------
  // getSession
  // -----------------------------------------------------------------------
  describe('getSession', () => {
    it('returns a session that exists', () => {
      const service = new RestoreService(absParser, appData);
      const session = setupSession(
        service,
        SESSION_ID,
        RestoreSessionState.MAPPING,
      );

      expect(service.getSession(SESSION_ID)).toBe(session);
    });

    it('returns undefined for a non-existent session', () => {
      const service = new RestoreService(absParser, appData);

      expect(service.getSession('nonexistent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getBackupDetails
  // -----------------------------------------------------------------------
  describe('getBackupDetails', () => {
    it('returns parsed backup when it exists', () => {
      const service = new RestoreService(absParser, appData);
      const backup = { details: { version: '2.0' }, libraries: [] };
      setupParsedBackup(service, SESSION_ID, backup);

      expect(service.getBackupDetails(SESSION_ID)).toBe(backup);
    });

    it('returns undefined when no parsed backup exists', () => {
      const service = new RestoreService(absParser, appData);

      expect(service.getBackupDetails('nonexistent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // setSelectedLibrary
  // -----------------------------------------------------------------------
  describe('setSelectedLibrary', () => {
    it('sets the selected library and initializes path mappings', async () => {
      const service = new RestoreService(absParser, appData);
      const session = setupSession(
        service,
        SESSION_ID,
        RestoreSessionState.MAPPING,
      );

      const backup = {
        libraryFolders: new Map([
          [
            LIBRARY_ID,
            [{ id: 'f1', path: '/abs/audiobooks', libraryId: LIBRARY_ID }],
          ],
        ]),
      };
      setupParsedBackup(service, SESSION_ID, backup);

      absParser.parseLibraryData.mockResolvedValue({
        libraryItems: [
          { id: 'item-1', title: 'Book 1', mediaId: 'b1' },
          { id: 'item-2', title: 'Book 2', mediaId: 'b2' },
        ],
        users: [{ id: 'u1', username: 'user1' }],
        mediaProgresses: [],
      });

      await service.setSelectedLibrary(SESSION_ID, LIBRARY_ID);

      expect(session.selectedLibraryId).toBe(LIBRARY_ID);
      expect(session.pathMappings).toHaveLength(1);
      expect(session.pathMappings[0].absPath).toBe('/abs/audiobooks');
      expect(session.pathMappings[0].savPath).toBe('');
      expect(session.totalItems).toBe(2);
    });

    it('throws BadRequestException when session is not in MAPPING state', async () => {
      const service = new RestoreService(absParser, appData);
      setupSession(service, SESSION_ID, RestoreSessionState.IMPORTING);

      await expect(
        service.setSelectedLibrary(SESSION_ID, LIBRARY_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when session does not exist', async () => {
      const service = new RestoreService(absParser, appData);

      await expect(
        service.setSelectedLibrary('nonexistent', LIBRARY_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('initializes user mappings with progress statistics', async () => {
      const service = new RestoreService(absParser, appData);
      const session = setupSession(
        service,
        SESSION_ID,
        RestoreSessionState.MAPPING,
      );
      setupParsedBackup(service, SESSION_ID, {
        libraryFolders: new Map([[LIBRARY_ID, []]]),
      });

      absParser.parseLibraryData.mockResolvedValue({
        libraryItems: [],
        users: [{ id: 'u1', username: 'alice' }],
        mediaProgresses: [
          { userId: 'u1', currentTime: 500, isFinished: false },
          { userId: 'u1', currentTime: 0, isFinished: true },
        ],
      });

      await service.setSelectedLibrary(SESSION_ID, LIBRARY_ID);

      expect(session.userMappings).toHaveLength(1);
      expect(session.userMappings[0]).toEqual(
        expect.objectContaining({
          absUserId: 'u1',
          absUsername: 'alice',
          savUserId: null,
          progressCount: 2,
          inProgressCount: 1,
          finishedCount: 1,
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // setPathMappings
  // -----------------------------------------------------------------------
  describe('setPathMappings', () => {
    it('sets path mappings when session is in MAPPING state', () => {
      const service = new RestoreService(absParser, appData);
      const session = setupSession(
        service,
        SESSION_ID,
        RestoreSessionState.MAPPING,
      );

      const mappings = [
        { absPath: '/abs/audiobooks', savPath: '/sav/audiobooks' },
      ];
      service.setPathMappings(SESSION_ID, mappings);

      expect(session.pathMappings).toEqual(mappings);
    });

    it('sets path mappings when session is in PREVIEWING state', () => {
      const service = new RestoreService(absParser, appData);
      const session = setupSession(
        service,
        SESSION_ID,
        RestoreSessionState.PREVIEWING,
      );

      const mappings = [
        { absPath: '/abs/audiobooks', savPath: '/sav/audiobooks' },
      ];
      service.setPathMappings(SESSION_ID, mappings);

      expect(session.pathMappings).toEqual(mappings);
    });

    it('throws BadRequestException when session is in IMPORTING state', () => {
      const service = new RestoreService(absParser, appData);
      setupSession(service, SESSION_ID, RestoreSessionState.IMPORTING);

      expect(() => service.setPathMappings(SESSION_ID, [])).toThrow(
        BadRequestException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // setUserMappings
  // -----------------------------------------------------------------------
  describe('setUserMappings', () => {
    it('merges savUserId while preserving metadata', () => {
      const service = new RestoreService(absParser, appData);
      const session = setupSession(
        service,
        SESSION_ID,
        RestoreSessionState.MAPPING,
        {
          userMappings: [
            {
              absUserId: 'u1',
              absUsername: 'alice',
              savUserId: null,
              progressCount: 5,
              inProgressCount: 3,
              finishedCount: 2,
            },
            {
              absUserId: 'u2',
              absUsername: 'bob',
              savUserId: null,
              progressCount: 2,
              inProgressCount: 1,
              finishedCount: 1,
            },
          ],
        },
      );

      service.setUserMappings(SESSION_ID, [
        { absUserId: 'u1', savUserId: 'sav-user-1' },
      ]);

      expect(session.userMappings[0].savUserId).toBe('sav-user-1');
      expect(session.userMappings[0].progressCount).toBe(5);
      // u2 unchanged
      expect(session.userMappings[1].savUserId).toBeNull();
    });

    it('allows setting savUserId to null (skip user)', () => {
      const service = new RestoreService(absParser, appData);
      const session = setupSession(
        service,
        SESSION_ID,
        RestoreSessionState.MAPPING,
        {
          userMappings: [
            {
              absUserId: 'u1',
              absUsername: 'alice',
              savUserId: 'old-id',
              progressCount: 1,
              inProgressCount: 0,
              finishedCount: 1,
            },
          ],
        },
      );

      service.setUserMappings(SESSION_ID, [
        { absUserId: 'u1', savUserId: null },
      ]);

      expect(session.userMappings[0].savUserId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // setOptions
  // -----------------------------------------------------------------------
  describe('setOptions', () => {
    it('merges partial options into session', () => {
      const service = new RestoreService(absParser, appData);
      const session = setupSession(
        service,
        SESSION_ID,
        RestoreSessionState.MAPPING,
      );

      service.setOptions(SESSION_ID, {
        overwriteExisting: true,
        lockMetadata: true,
      });

      expect(session.options.overwriteExisting).toBe(true);
      expect(session.options.lockMetadata).toBe(true);
      // Unchanged defaults
      expect(session.options.importProgress).toBe(true);
      expect(session.options.importCovers).toBe(true);
    });

    it('throws BadRequestException when session is in wrong state', () => {
      const service = new RestoreService(absParser, appData);
      setupSession(service, SESSION_ID, RestoreSessionState.COMPLETED);

      expect(() =>
        service.setOptions(SESSION_ID, { importProgress: false }),
      ).toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // generatePreview
  // -----------------------------------------------------------------------
  describe('generatePreview', () => {
    it('throws BadRequestException when no library is selected', async () => {
      const service = new RestoreService(absParser, appData);
      setupSession(service, SESSION_ID, RestoreSessionState.MAPPING);

      await expect(service.generatePreview(SESSION_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when no path mappings are configured', async () => {
      const service = new RestoreService(absParser, appData);
      setupSession(service, SESSION_ID, RestoreSessionState.MAPPING, {
        selectedLibraryId: LIBRARY_ID,
        pathMappings: [],
      });

      await expect(service.generatePreview(SESSION_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('generates preview with correct item counts', async () => {
      // Make stat throw to simulate file-not-found (items go to skip list)
      mockedFs.stat.mockRejectedValue(new Error('ENOENT'));

      const service = new RestoreService(absParser, appData);
      setupSession(service, SESSION_ID, RestoreSessionState.MAPPING, {
        selectedLibraryId: LIBRARY_ID,
        pathMappings: [{ absPath: '/abs/lib', savPath: '/sav/lib' }],
        userMappings: [
          {
            absUserId: 'u1',
            absUsername: 'alice',
            savUserId: 'sav-1',
            progressCount: 1,
            inProgressCount: 0,
            finishedCount: 1,
          },
        ],
        options: {
          importProgress: true,
          importCovers: false,
          importAuthorImages: false,
          overwriteExisting: false,
          lockMetadata: false,
        },
      });

      absParser.parseLibraryData.mockResolvedValue({
        libraryItems: [
          {
            id: 'item-1',
            title: 'Book 1',
            mediaId: 'b1',
            path: '/abs/lib/Author/Book1',
            authorNamesFirstLast: 'Author',
          },
        ],
        books: new Map([
          [
            'b1',
            {
              id: 'b1',
              title: 'Book 1',
              audioFiles: [],
              chapters: [{ title: 'Ch1', start: 0, end: 100 }],
              narrators: ['Narrator'],
              genres: ['Fiction'],
            },
          ],
        ]),
        authors: [{ id: 'a1', name: 'Author' }],
        series: [{ id: 's1', name: 'Series' }],
        bookAuthors: [],
        bookSeries: [],
        users: [{ id: 'u1', username: 'alice' }],
        mediaProgresses: [
          {
            userId: 'u1',
            mediaItemId: 'item-1',
            currentTime: 500,
            isFinished: false,
          },
        ],
      });

      const preview = await service.generatePreview(SESSION_ID);

      // All items skipped since fs.stat throws
      expect(preview.audiobooksToSkip.count).toBe(1);
      expect(preview.authorsToImport).toBe(1);
      expect(preview.narratorsToImport).toBe(1);
      expect(preview.seriesToImport).toBe(1);
      expect(preview.genresToImport).toBe(1);
      expect(preview.chaptersToImport).toBe(1);
      expect(preview.usersToMap.total).toBe(1);
      expect(preview.usersToMap.mapped).toBe(1);
      expect(preview.progressRecordsToImport).toBe(1);
    });

    it('transitions session state to PREVIEWING', async () => {
      mockedFs.stat.mockRejectedValue(new Error('ENOENT'));

      const service = new RestoreService(absParser, appData);
      const session = setupSession(
        service,
        SESSION_ID,
        RestoreSessionState.MAPPING,
        {
          selectedLibraryId: LIBRARY_ID,
          pathMappings: [{ absPath: '/abs/lib', savPath: '/sav/lib' }],
          options: {
            importProgress: false,
            importCovers: false,
            importAuthorImages: false,
            overwriteExisting: false,
            lockMetadata: false,
          },
        },
      );

      absParser.parseLibraryData.mockResolvedValue({
        libraryItems: [],
        books: new Map(),
        authors: [],
        series: [],
        bookAuthors: [],
        bookSeries: [],
        users: [],
        mediaProgresses: [],
      });

      await service.generatePreview(SESSION_ID);

      expect(session.state).toBe(RestoreSessionState.PREVIEWING);
    });
  });

  // -----------------------------------------------------------------------
  // cancelSession
  // -----------------------------------------------------------------------
  describe('cancelSession', () => {
    it('removes the session and parsed backup', async () => {
      mockedFs.rm.mockResolvedValue(undefined);

      const service = new RestoreService(absParser, appData);
      setupSession(service, SESSION_ID, RestoreSessionState.MAPPING);
      setupParsedBackup(service, SESSION_ID, { details: {} });

      await service.cancelSession(SESSION_ID);

      expect(service.getSession(SESSION_ID)).toBeUndefined();
      expect(service.getBackupDetails(SESSION_ID)).toBeUndefined();
    });

    it('cleans up temporary files on disk', async () => {
      mockedFs.rm.mockResolvedValue(undefined);

      const service = new RestoreService(absParser, appData);
      setupSession(service, SESSION_ID, RestoreSessionState.MAPPING, {
        extractedPath: '/tmp/test-session',
      });

      await service.cancelSession(SESSION_ID);

      expect(mockedFs.rm).toHaveBeenCalledWith('/tmp/test-session', {
        recursive: true,
        force: true,
      });
    });

    it('throws NotFoundException when session does not exist', async () => {
      const service = new RestoreService(absParser, appData);

      await expect(service.cancelSession('nonexistent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
