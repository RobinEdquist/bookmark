jest.mock('fs/promises');

import * as fs from 'fs/promises';
import * as path from 'path';
import { MediaDetectorService } from '../media-detector.service';

const mockedFs = jest.mocked(fs);

function mockDirent(name: string, isFile: boolean): any {
  return {
    name,
    isFile: () => isFile,
    isDirectory: () => !isFile,
  };
}

function mockStat(
  overrides: Partial<{ isFile: boolean; isDirectory: boolean }> = {},
): any {
  const { isFile = false, isDirectory = false } = overrides;
  return {
    isFile: () => isFile,
    isDirectory: () => isDirectory,
    size: 1024,
    mtimeMs: Date.now(),
  };
}

describe('MediaDetectorService', () => {
  let service: MediaDetectorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaDetectorService();
  });

  // ===== scanLibraryForAudiobooks =====

  describe('scanLibraryForAudiobooks', () => {
    it('should return empty array for empty library', async () => {
      mockedFs.readdir.mockResolvedValueOnce([] as any);

      const result = await service.scanLibraryForAudiobooks('/library');
      expect(result).toEqual([]);
    });

    it('should detect root-level single audio file (.m4b)', async () => {
      mockedFs.readdir.mockResolvedValueOnce([
        mockDirent('book.m4b', true),
      ] as any);

      const result = await service.scanLibraryForAudiobooks('/library');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'single-file',
        path: path.join('/library', 'book.m4b'),
        files: [path.join('/library', 'book.m4b')],
      });
    });

    it('should detect root-level single audio file (.mp3)', async () => {
      mockedFs.readdir.mockResolvedValueOnce([
        mockDirent('song.mp3', true),
      ] as any);

      const result = await service.scanLibraryForAudiobooks('/library');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('single-file');
    });

    it('should ignore non-audio files at root', async () => {
      mockedFs.readdir.mockResolvedValueOnce([
        mockDirent('readme.txt', true),
        mockDirent('cover.jpg', true),
        mockDirent('metadata.json', true),
      ] as any);

      const result = await service.scanLibraryForAudiobooks('/library');
      expect(result).toEqual([]);
    });

    it('should detect folder with single audio file as single-file unit', async () => {
      mockedFs.readdir
        // Root readdir
        .mockResolvedValueOnce([mockDirent('MyBook', false)] as any)
        // Subdirectory readdir
        .mockResolvedValueOnce([mockDirent('chapter1.m4b', true)] as any);

      const result = await service.scanLibraryForAudiobooks('/library');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'single-file',
        path: path.join('/library', 'MyBook'),
        files: [path.join('/library', 'MyBook', 'chapter1.m4b')],
      });
    });

    it('should detect folder with multiple audio files as multi-file unit', async () => {
      mockedFs.readdir
        .mockResolvedValueOnce([mockDirent('MyBook', false)] as any)
        .mockResolvedValueOnce([
          mockDirent('chapter1.mp3', true),
          mockDirent('chapter2.mp3', true),
          mockDirent('chapter3.mp3', true),
        ] as any);

      const result = await service.scanLibraryForAudiobooks('/library');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('multi-file');
      expect(result[0].files).toHaveLength(3);
    });

    it('should sort files alphabetically within a unit', async () => {
      mockedFs.readdir
        .mockResolvedValueOnce([mockDirent('MyBook', false)] as any)
        .mockResolvedValueOnce([
          mockDirent('c_chapter.mp3', true),
          mockDirent('a_chapter.mp3', true),
          mockDirent('b_chapter.mp3', true),
        ] as any);

      const result = await service.scanLibraryForAudiobooks('/library');
      const basenames = result[0].files.map((f) => path.basename(f));
      expect(basenames).toEqual([
        'a_chapter.mp3',
        'b_chapter.mp3',
        'c_chapter.mp3',
      ]);
    });

    it('should skip hidden directories', async () => {
      mockedFs.readdir.mockResolvedValueOnce([
        mockDirent('.hidden', false),
        mockDirent('.cache', false),
      ] as any);

      const result = await service.scanLibraryForAudiobooks('/library');
      expect(result).toEqual([]);
      // readdir should only be called once (root)
      expect(mockedFs.readdir).toHaveBeenCalledTimes(1);
    });

    it('should scan subdirectories recursively', async () => {
      // Root has a directory with no audio but a sub-subdirectory
      mockedFs.readdir
        .mockResolvedValueOnce([mockDirent('Author', false)] as any)
        // Author directory has no audio, just a subdirectory
        .mockResolvedValueOnce([mockDirent('BookTitle', false)] as any)
        // BookTitle has audio
        .mockResolvedValueOnce([mockDirent('track.m4b', true)] as any);

      const result = await service.scanLibraryForAudiobooks('/library');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe(path.join('/library', 'Author', 'BookTitle'));
    });

    it('should handle unreadable subdirectories gracefully', async () => {
      mockedFs.readdir
        .mockResolvedValueOnce([mockDirent('BadDir', false)] as any)
        .mockRejectedValueOnce(new Error('Permission denied'));

      const result = await service.scanLibraryForAudiobooks('/library');
      expect(result).toEqual([]);
    });

    it('should throw when root path read fails', async () => {
      mockedFs.readdir.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(
        service.scanLibraryForAudiobooks('/nonexistent'),
      ).rejects.toThrow('ENOENT');
    });
  });

  // ===== detectAudiobook =====

  describe('detectAudiobook', () => {
    it('should return single-file unit for audio file', async () => {
      mockedFs.stat.mockResolvedValueOnce(mockStat({ isFile: true }));

      const result = await service.detectAudiobook('/lib/book.m4b');
      expect(result).toEqual({
        type: 'single-file',
        path: '/lib/book.m4b',
        files: ['/lib/book.m4b'],
      });
    });

    it('should return null for non-audio file', async () => {
      mockedFs.stat.mockResolvedValueOnce(mockStat({ isFile: true }));

      const result = await service.detectAudiobook('/lib/readme.txt');
      expect(result).toBeNull();
    });

    it('should return unit for directory with audio files', async () => {
      mockedFs.stat.mockResolvedValueOnce(mockStat({ isDirectory: true }));
      mockedFs.readdir.mockResolvedValueOnce([
        mockDirent('part1.mp3', true),
        mockDirent('part2.mp3', true),
        mockDirent('cover.jpg', true),
      ] as any);

      const result = await service.detectAudiobook('/lib/MyBook');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('multi-file');
      expect(result!.files).toHaveLength(2);
      // Non-audio files filtered out
      expect(result!.files.every((f) => f.endsWith('.mp3'))).toBe(true);
    });

    it('should return null for empty directory', async () => {
      mockedFs.stat.mockResolvedValueOnce(mockStat({ isDirectory: true }));
      mockedFs.readdir.mockResolvedValueOnce([] as any);

      const result = await service.detectAudiobook('/lib/EmptyDir');
      expect(result).toBeNull();
    });

    it('should return null when stat throws', async () => {
      mockedFs.stat.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await service.detectAudiobook('/lib/missing');
      expect(result).toBeNull();
    });
  });

  // ===== scanLibraryForEbooks =====

  describe('scanLibraryForEbooks', () => {
    it('should return empty array for empty library', async () => {
      mockedFs.readdir.mockResolvedValueOnce([] as any);

      const result = await service.scanLibraryForEbooks('/ebooks');
      expect(result).toEqual([]);
    });

    it('should detect .epub files', async () => {
      mockedFs.readdir.mockResolvedValueOnce([
        mockDirent('book.epub', true),
      ] as any);

      const result = await service.scanLibraryForEbooks('/ebooks');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: path.join('/ebooks', 'book.epub'),
        fileName: 'book.epub',
      });
    });

    it('should ignore non-epub files', async () => {
      mockedFs.readdir.mockResolvedValueOnce([
        mockDirent('book.pdf', true),
        mockDirent('book.mobi', true),
        mockDirent('notes.txt', true),
      ] as any);

      const result = await service.scanLibraryForEbooks('/ebooks');
      expect(result).toEqual([]);
    });

    it('should scan recursively into subdirectories', async () => {
      mockedFs.readdir
        .mockResolvedValueOnce([
          mockDirent('Author', false),
          mockDirent('root.epub', true),
        ] as any)
        .mockResolvedValueOnce([mockDirent('nested.epub', true)] as any);

      const result = await service.scanLibraryForEbooks('/ebooks');
      expect(result).toHaveLength(2);
      expect(result.map((u) => u.fileName)).toContain('root.epub');
      expect(result.map((u) => u.fileName)).toContain('nested.epub');
    });

    it('should skip hidden directories', async () => {
      mockedFs.readdir.mockResolvedValueOnce([
        mockDirent('.calibre', false),
        mockDirent('visible.epub', true),
      ] as any);

      const result = await service.scanLibraryForEbooks('/ebooks');
      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('visible.epub');
      // readdir called once for root only; .calibre not entered
      expect(mockedFs.readdir).toHaveBeenCalledTimes(1);
    });
  });

  // ===== detectEbook =====

  describe('detectEbook', () => {
    it('should return unit for .epub file', async () => {
      mockedFs.stat.mockResolvedValueOnce(mockStat({ isFile: true }));

      const result = await service.detectEbook('/ebooks/book.epub');
      expect(result).toEqual({
        path: '/ebooks/book.epub',
        fileName: 'book.epub',
      });
    });

    it('should return null for non-epub file', async () => {
      mockedFs.stat.mockResolvedValueOnce(mockStat({ isFile: true }));

      const result = await service.detectEbook('/ebooks/book.pdf');
      expect(result).toBeNull();
    });

    it('should return null when file not found', async () => {
      mockedFs.stat.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await service.detectEbook('/ebooks/missing.epub');
      expect(result).toBeNull();
    });
  });
});
