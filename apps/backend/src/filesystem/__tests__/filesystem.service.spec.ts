jest.mock('fs/promises');

import * as fs from 'fs/promises';
import { BadRequestException } from '@nestjs/common';
import { FilesystemService } from '../filesystem.service';

const mockedFs = jest.mocked(fs);

describe('FilesystemService', () => {
  let service: FilesystemService;

  beforeEach(() => {
    service = new FilesystemService();
    jest.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // browse
  // -------------------------------------------------------------------------
  describe('browse', () => {
    it('returns sorted directories and excludes hidden dirs', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockedFs.readdir.mockResolvedValue([
        { name: 'bravo', isDirectory: () => true },
        { name: 'alpha', isDirectory: () => true },
        { name: '.hidden', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ] as any);

      const result = await service.browse('/test');

      expect(result.directories).toHaveLength(2);
      expect(result.directories[0].name).toBe('alpha');
      expect(result.directories[1].name).toBe('bravo');
    });

    it('throws BadRequestException when path does not exist', async () => {
      mockedFs.stat.mockRejectedValue(new Error('ENOENT'));

      await expect(service.browse('/nonexistent')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.browse('/nonexistent')).rejects.toThrow(
        'Path does not exist or is not accessible',
      );
    });

    it('throws BadRequestException when path is not a directory', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      await expect(service.browse('/some/file.txt')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.browse('/some/file.txt')).rejects.toThrow(
        'Path is not a directory',
      );
    });

    it('returns null parentPath for root directory', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockedFs.readdir.mockResolvedValue([] as any);

      const result = await service.browse('/');

      expect(result.parentPath).toBeNull();
      expect(result.currentPath).toBe('/');
    });

    it('returns correct parentPath for nested directory', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockedFs.readdir.mockResolvedValue([] as any);

      const result = await service.browse('/data/audiobooks');

      expect(result.parentPath).toBe('/data');
      expect(result.currentPath).toBe('/data/audiobooks');
    });
  });

  // -------------------------------------------------------------------------
  // createDirectory
  // -------------------------------------------------------------------------
  describe('createDirectory', () => {
    it('succeeds and returns directory info', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);

      const result = await service.createDirectory('/parent/newdir');

      expect(result.name).toBe('newdir');
      expect(result.path).toBe('/parent/newdir');
      expect(mockedFs.mkdir).toHaveBeenCalledWith('/parent/newdir');
    });

    it('throws BadRequestException on EEXIST', async () => {
      const error = new Error('exists') as NodeJS.ErrnoException;
      error.code = 'EEXIST';
      mockedFs.mkdir.mockRejectedValue(error);

      await expect(service.createDirectory('/parent/existing')).rejects.toThrow(
        'Directory already exists',
      );
    });

    it('throws BadRequestException on ENOENT', async () => {
      const error = new Error('no parent') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockedFs.mkdir.mockRejectedValue(error);

      await expect(
        service.createDirectory('/missing/parent/dir'),
      ).rejects.toThrow('Parent directory does not exist');
    });

    it('throws BadRequestException on EACCES', async () => {
      const error = new Error('permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockedFs.mkdir.mockRejectedValue(error);

      await expect(service.createDirectory('/restricted/dir')).rejects.toThrow(
        'Permission denied',
      );
    });

    it('throws BadRequestException for hidden directory name', async () => {
      await expect(service.createDirectory('/parent/.hidden')).rejects.toThrow(
        'Invalid directory name',
      );

      // mkdir should never be called
      expect(mockedFs.mkdir).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for generic fs error', async () => {
      mockedFs.mkdir.mockRejectedValue(new Error('unknown error'));

      await expect(service.createDirectory('/parent/newdir')).rejects.toThrow(
        'Failed to create directory',
      );
    });
  });

  // -------------------------------------------------------------------------
  // getInitialPath
  // -------------------------------------------------------------------------
  describe('getInitialPath', () => {
    it('returns /data when accessible', async () => {
      mockedFs.access.mockResolvedValue(undefined);

      const result = await service.getInitialPath();

      expect(result).toBe('/data');
      expect(mockedFs.access).toHaveBeenCalledWith('/data', fs.constants.R_OK);
    });

    it('returns / when /data is not accessible', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getInitialPath();

      expect(result).toBe('/');
    });
  });
});
