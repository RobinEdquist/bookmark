import { generateChaptersFromFiles } from '../chapter.utils';
import { AudioFileInfo } from '../../metadata/embedded-metadata.provider';

describe('chapter.utils', () => {
  describe('generateChaptersFromFiles', () => {
    const createFileInfo = (
      fileName: string,
      duration: number,
    ): AudioFileInfo => ({
      filePath: `/library/audiobook/${fileName}`,
      fileName,
      duration,
      format: 'mp3',
      sizeBytes: duration * 16000, // ~128kbps
    });

    describe('basic functionality', () => {
      it('should return empty array for empty input', () => {
        expect(generateChaptersFromFiles([])).toEqual([]);
      });

      it('should generate single chapter for single file', () => {
        const files = [createFileInfo('01 - Introduction.mp3', 300)];
        const result = generateChaptersFromFiles(files);

        expect(result).toEqual([
          { title: '01 - Introduction', startTime: 0, endTime: 300 },
        ]);
      });

      it('should generate chapters with cumulative timing for multiple files', () => {
        const files = [
          createFileInfo('01 - Intro.mp3', 300), // 5 minutes
          createFileInfo('02 - Chapter 1.mp3', 1800), // 30 minutes
          createFileInfo('03 - Chapter 2.mp3', 2400), // 40 minutes
        ];
        const result = generateChaptersFromFiles(files);

        expect(result).toEqual([
          { title: '01 - Intro', startTime: 0, endTime: 300 },
          { title: '02 - Chapter 1', startTime: 300, endTime: 2100 },
          { title: '03 - Chapter 2', startTime: 2100, endTime: 4500 },
        ]);
      });
    });

    describe('title extraction', () => {
      it('should extract title from filename without extension', () => {
        const files = [createFileInfo('My Chapter.mp3', 100)];
        const result = generateChaptersFromFiles(files);
        expect(result[0].title).toBe('My Chapter');
      });

      it('should handle various audio extensions', () => {
        const files = [
          createFileInfo('Part 1.m4b', 100),
          createFileInfo('Part 2.m4a', 100),
          createFileInfo('Part 3.flac', 100),
        ];
        const result = generateChaptersFromFiles(files);

        expect(result[0].title).toBe('Part 1');
        expect(result[1].title).toBe('Part 2');
        expect(result[2].title).toBe('Part 3');
      });

      it('should handle filenames with multiple dots', () => {
        const files = [createFileInfo('Part 1. The Beginning.mp3', 100)];
        const result = generateChaptersFromFiles(files);
        expect(result[0].title).toBe('Part 1. The Beginning');
      });

      it('should preserve special characters in titles', () => {
        const files = [
          createFileInfo("Chapter 1 - What's Next?.mp3", 100),
          createFileInfo('Chapter 2 [Bonus].mp3', 100),
        ];
        const result = generateChaptersFromFiles(files);

        expect(result[0].title).toBe("Chapter 1 - What's Next?");
        expect(result[1].title).toBe('Chapter 2 [Bonus]');
      });

      it('should handle unicode in filenames', () => {
        const files = [createFileInfo('第1章 - 序章.mp3', 100)];
        const result = generateChaptersFromFiles(files);
        expect(result[0].title).toBe('第1章 - 序章');
      });
    });

    describe('timing calculations', () => {
      it('should start first chapter at time 0', () => {
        const files = [createFileInfo('file.mp3', 500)];
        const result = generateChaptersFromFiles(files);
        expect(result[0].startTime).toBe(0);
      });

      it('should have contiguous chapter boundaries (no gaps)', () => {
        const files = [
          createFileInfo('01.mp3', 100),
          createFileInfo('02.mp3', 200),
          createFileInfo('03.mp3', 300),
        ];
        const result = generateChaptersFromFiles(files);

        // Each chapter's start should equal the previous chapter's end
        expect(result[0].endTime).toBe(result[1].startTime);
        expect(result[1].endTime).toBe(result[2].startTime);
      });

      it('should calculate total duration correctly', () => {
        const files = [
          createFileInfo('01.mp3', 100),
          createFileInfo('02.mp3', 200),
          createFileInfo('03.mp3', 300),
        ];
        const result = generateChaptersFromFiles(files);

        // Total duration should be sum of all file durations
        const totalDuration = files.reduce((sum, f) => sum + f.duration, 0);
        const lastChapter = result[result.length - 1];
        expect(lastChapter.endTime).toBe(totalDuration);
      });

      it('should handle fractional durations', () => {
        const files = [
          createFileInfo('01.mp3', 100.5),
          createFileInfo('02.mp3', 200.75),
        ];
        const result = generateChaptersFromFiles(files);

        expect(result[0].endTime).toBe(100.5);
        expect(result[1].startTime).toBe(100.5);
        expect(result[1].endTime).toBe(301.25);
      });

      it('should handle very short files', () => {
        const files = [
          createFileInfo('intro.mp3', 1), // 1 second
          createFileInfo('content.mp3', 3600), // 1 hour
        ];
        const result = generateChaptersFromFiles(files);

        expect(result[0]).toEqual({ title: 'intro', startTime: 0, endTime: 1 });
        expect(result[1]).toEqual({
          title: 'content',
          startTime: 1,
          endTime: 3601,
        });
      });
    });

    describe('edge cases', () => {
      it('should handle files with zero duration', () => {
        const files = [
          createFileInfo('01.mp3', 100),
          createFileInfo('02.mp3', 0), // empty/corrupt file
          createFileInfo('03.mp3', 100),
        ];
        const result = generateChaptersFromFiles(files);

        expect(result[1].startTime).toBe(100);
        expect(result[1].endTime).toBe(100); // zero-length chapter
        expect(result[2].startTime).toBe(100);
      });

      it('should handle many files', () => {
        const files = Array.from({ length: 100 }, (_, i) =>
          createFileInfo(`Track ${i + 1}.mp3`, 60),
        );
        const result = generateChaptersFromFiles(files);

        expect(result).toHaveLength(100);
        expect(result[99].endTime).toBe(6000); // 100 files * 60 seconds
      });
    });
  });
});
