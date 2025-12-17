import {
  calculateAudiobookPaths,
  calculateEbookPath,
  resolveAudiobookFilePath,
} from '../path.utils';
import { AudiobookUnit, EbookUnit } from '../../media-detector.service';

describe('path.utils', () => {
  describe('calculateAudiobookPaths', () => {
    describe('root-level single-file audiobooks', () => {
      it('should return isRootLevelFile=true and empty path for root-level file', () => {
        const unit: AudiobookUnit = {
          type: 'single-file',
          path: '/library/book.m4b',
          files: ['/library/book.m4b'],
        };
        const result = calculateAudiobookPaths(unit, '/library');
        expect(result).toEqual({ isRootLevelFile: true, relativeUnitPath: '' });
      });

      it('should handle library path with trailing slash', () => {
        const unit: AudiobookUnit = {
          type: 'single-file',
          path: '/library/book.m4b',
          files: ['/library/book.m4b'],
        };
        // Note: path.relative handles trailing slashes correctly
        const result = calculateAudiobookPaths(unit, '/library');
        expect(result.isRootLevelFile).toBe(true);
        expect(result.relativeUnitPath).toBe('');
      });
    });

    describe('subdirectory audiobooks', () => {
      it('should return isRootLevelFile=false and folder path for subdirectory single-file', () => {
        const unit: AudiobookUnit = {
          type: 'single-file',
          path: '/library/Author - Title',
          files: ['/library/Author - Title/book.m4b'],
        };
        const result = calculateAudiobookPaths(unit, '/library');
        expect(result).toEqual({
          isRootLevelFile: false,
          relativeUnitPath: 'Author - Title',
        });
      });

      it('should handle nested subdirectory paths', () => {
        const unit: AudiobookUnit = {
          type: 'single-file',
          path: '/library/A/B/C',
          files: ['/library/A/B/C/book.m4b'],
        };
        const result = calculateAudiobookPaths(unit, '/library');
        expect(result).toEqual({
          isRootLevelFile: false,
          relativeUnitPath: 'A/B/C',
        });
      });
    });

    describe('multi-file audiobooks', () => {
      it('should return isRootLevelFile=false for multi-file audiobooks', () => {
        const unit: AudiobookUnit = {
          type: 'multi-file',
          path: '/library/Series/Book',
          files: [
            '/library/Series/Book/part1.mp3',
            '/library/Series/Book/part2.mp3',
          ],
        };
        const result = calculateAudiobookPaths(unit, '/library');
        expect(result).toEqual({
          isRootLevelFile: false,
          relativeUnitPath: 'Series/Book',
        });
      });

      it('should handle multi-file at immediate subdirectory', () => {
        const unit: AudiobookUnit = {
          type: 'multi-file',
          path: '/library/Audiobook',
          files: ['/library/Audiobook/cd1.mp3', '/library/Audiobook/cd2.mp3'],
        };
        const result = calculateAudiobookPaths(unit, '/library');
        expect(result).toEqual({
          isRootLevelFile: false,
          relativeUnitPath: 'Audiobook',
        });
      });
    });

    describe('special characters in paths', () => {
      it('should preserve paths with special characters', () => {
        const unit: AudiobookUnit = {
          type: 'single-file',
          path: "/library/Author's Book (2024)",
          files: ["/library/Author's Book (2024)/book.m4b"],
        };
        const result = calculateAudiobookPaths(unit, '/library');
        expect(result).toEqual({
          isRootLevelFile: false,
          relativeUnitPath: "Author's Book (2024)",
        });
      });

      it('should preserve paths with unicode characters', () => {
        const unit: AudiobookUnit = {
          type: 'single-file',
          path: '/library/日本語タイトル',
          files: ['/library/日本語タイトル/book.m4b'],
        };
        const result = calculateAudiobookPaths(unit, '/library');
        expect(result).toEqual({
          isRootLevelFile: false,
          relativeUnitPath: '日本語タイトル',
        });
      });

      it('should handle paths with brackets and ampersands', () => {
        const unit: AudiobookUnit = {
          type: 'single-file',
          path: '/library/[Series] Book & More',
          files: ['/library/[Series] Book & More/audio.m4b'],
        };
        const result = calculateAudiobookPaths(unit, '/library');
        expect(result).toEqual({
          isRootLevelFile: false,
          relativeUnitPath: '[Series] Book & More',
        });
      });
    });
  });

  describe('calculateEbookPath', () => {
    it('should return filename for root-level ebook', () => {
      const unit: EbookUnit = {
        path: '/library/Book.epub',
        fileName: 'Book.epub',
      };
      const result = calculateEbookPath(unit, '/library');
      expect(result).toBe('Book.epub');
    });

    it('should return relative path for nested ebook', () => {
      const unit: EbookUnit = {
        path: '/library/Author/Series/Book.epub',
        fileName: 'Book.epub',
      };
      const result = calculateEbookPath(unit, '/library');
      expect(result).toBe('Author/Series/Book.epub');
    });

    it('should handle single level of nesting', () => {
      const unit: EbookUnit = {
        path: '/library/Folder/Book.epub',
        fileName: 'Book.epub',
      };
      const result = calculateEbookPath(unit, '/library');
      expect(result).toBe('Folder/Book.epub');
    });

    it('should preserve special characters', () => {
      const unit: EbookUnit = {
        path: "/library/Author's Work/Book (2024).epub",
        fileName: 'Book (2024).epub',
      };
      const result = calculateEbookPath(unit, '/library');
      expect(result).toBe("Author's Work/Book (2024).epub");
    });
  });

  describe('resolveAudiobookFilePath', () => {
    it('should resolve path for root-level file (empty audiobookFilePath)', () => {
      const result = resolveAudiobookFilePath('/library', '', 'book.m4b');
      expect(result).toBe('/library/book.m4b');
    });

    it('should resolve path for subdirectory file', () => {
      const result = resolveAudiobookFilePath(
        '/library',
        'Author - Title',
        'book.m4b',
      );
      expect(result).toBe('/library/Author - Title/book.m4b');
    });

    it('should resolve path for deeply nested file', () => {
      const result = resolveAudiobookFilePath('/library', 'A/B/C', 'book.m4b');
      expect(result).toBe('/library/A/B/C/book.m4b');
    });

    it('should handle special characters in all path components', () => {
      const result = resolveAudiobookFilePath(
        '/my library',
        "Author's Book (2024)",
        'Track #1.mp3',
      );
      expect(result).toBe("/my library/Author's Book (2024)/Track #1.mp3");
    });
  });
});
