import {
  sanitizeText,
  normalizePublishedDate,
  inferTitleFromPath,
} from '../text.utils';

describe('text.utils', () => {
  describe('sanitizeText', () => {
    describe('null/undefined handling', () => {
      it('should return undefined for undefined input', () => {
        expect(sanitizeText(undefined)).toBeUndefined();
      });

      it('should return undefined for empty string', () => {
        expect(sanitizeText('')).toBeUndefined();
      });
    });

    describe('smart quotes replacement', () => {
      it('should replace single smart quotes with straight quotes', () => {
        expect(sanitizeText("It's a test")).toBe("It's a test");
        expect(sanitizeText('\u2018quoted\u2019')).toBe("'quoted'");
        expect(sanitizeText('\u201Aquoted\u201B')).toBe("'quoted'");
      });

      it('should replace double smart quotes with straight quotes', () => {
        expect(sanitizeText('\u201Cquoted\u201D')).toBe('"quoted"');
        expect(sanitizeText('\u201Equoted\u201F')).toBe('"quoted"');
      });

      it('should handle mixed quote types', () => {
        expect(sanitizeText('\u201CHe said \u2018hello\u2019\u201D')).toBe(
          '"He said \'hello\'"',
        );
      });
    });

    describe('dash replacement', () => {
      it('should replace en-dash with hyphen', () => {
        expect(sanitizeText('pages 1\u20135')).toBe('pages 1-5');
      });

      it('should replace em-dash with hyphen', () => {
        expect(sanitizeText('word\u2014another')).toBe('word-another');
      });

      it('should replace horizontal bar with hyphen', () => {
        expect(sanitizeText('a\u2015b')).toBe('a-b');
      });
    });

    describe('ellipsis replacement', () => {
      it('should replace ellipsis character with three dots', () => {
        expect(sanitizeText('wait\u2026')).toBe('wait...');
      });

      it('should handle multiple ellipses', () => {
        expect(sanitizeText('\u2026and\u2026')).toBe('...and...');
      });
    });

    describe('null byte removal', () => {
      it('should remove null bytes', () => {
        expect(sanitizeText('hello\0world')).toBe('helloworld');
      });

      it('should remove multiple null bytes', () => {
        expect(sanitizeText('\0test\0\0string\0')).toBe('teststring');
      });
    });

    describe('combined replacements', () => {
      it('should handle text with multiple problematic characters', () => {
        const input = '\u201CIt\u2019s a test\u2026\u201D \u2014 Author';
        const expected = '"It\'s a test..." - Author';
        expect(sanitizeText(input)).toBe(expected);
      });

      it('should preserve normal ASCII text unchanged', () => {
        const input = 'Normal text with "quotes" and - dashes';
        expect(sanitizeText(input)).toBe(input);
      });
    });
  });

  describe('normalizePublishedDate', () => {
    describe('null/undefined handling', () => {
      it('should return undefined for undefined input', () => {
        expect(normalizePublishedDate(undefined)).toBeUndefined();
      });

      it('should return undefined for empty string', () => {
        expect(normalizePublishedDate('')).toBeUndefined();
      });
    });

    describe('year-only format', () => {
      it('should convert valid year to YYYY-01-01 format', () => {
        expect(normalizePublishedDate('2023')).toBe('2023-01-01');
        expect(normalizePublishedDate('1999')).toBe('1999-01-01');
        expect(normalizePublishedDate('1000')).toBe('1000-01-01');
        expect(normalizePublishedDate('2100')).toBe('2100-01-01');
      });

      it('should return undefined for 4-digit years outside valid range', () => {
        // Years that match the 4-digit regex but are outside 1000-2100
        expect(normalizePublishedDate('0000')).toBeUndefined();
        expect(normalizePublishedDate('0999')).toBeUndefined();
        expect(normalizePublishedDate('2101')).toBeUndefined();
      });

      it('should treat non-4-digit numbers as regular date strings', () => {
        // These don't match the year-only regex, so they go through Date parsing
        // JavaScript's Date constructor can parse these as years
        expect(normalizePublishedDate('999')).toBe('999'); // Date parses this
        expect(normalizePublishedDate('20230')).toBe('20230'); // Date parses this
      });
    });

    describe('full date formats', () => {
      it('should pass through valid ISO dates', () => {
        expect(normalizePublishedDate('2023-06-15')).toBe('2023-06-15');
      });

      it('should pass through other parseable date formats', () => {
        // JavaScript Date can parse various formats
        expect(normalizePublishedDate('June 15, 2023')).toBe('June 15, 2023');
      });

      it('should return undefined for invalid date strings', () => {
        expect(normalizePublishedDate('not a date')).toBeUndefined();
        expect(normalizePublishedDate('abc123')).toBeUndefined();
      });
    });
  });

  describe('inferTitleFromPath', () => {
    describe('single-file audiobooks', () => {
      it('should extract title from filename without extension', () => {
        expect(
          inferTitleFromPath('/library/My Audiobook.m4b', 'single-file'),
        ).toBe('My Audiobook');
      });

      it('should handle various audio extensions', () => {
        expect(inferTitleFromPath('/library/Book.mp3', 'single-file')).toBe(
          'Book',
        );
        expect(inferTitleFromPath('/library/Book.m4a', 'single-file')).toBe(
          'Book',
        );
        expect(inferTitleFromPath('/library/Book.flac', 'single-file')).toBe(
          'Book',
        );
      });

      it('should handle paths with multiple dots', () => {
        expect(
          inferTitleFromPath(
            '/library/Author - Book Vol. 1.m4b',
            'single-file',
          ),
        ).toBe('Author - Book Vol. 1');
      });

      it('should handle nested paths', () => {
        expect(
          inferTitleFromPath(
            '/library/folder/subfolder/Book.m4b',
            'single-file',
          ),
        ).toBe('Book');
      });
    });

    describe('multi-file audiobooks', () => {
      it('should return folder name for multi-file audiobooks', () => {
        expect(
          inferTitleFromPath('/library/Author - Title', 'multi-file'),
        ).toBe('Author - Title');
      });

      it('should return only immediate folder name for nested paths', () => {
        expect(
          inferTitleFromPath('/library/Author/Series/Book Title', 'multi-file'),
        ).toBe('Book Title');
      });

      it('should handle paths with special characters', () => {
        expect(
          inferTitleFromPath("/library/Author's Book (2024)", 'multi-file'),
        ).toBe("Author's Book (2024)");
      });
    });

    describe('edge cases', () => {
      it('should handle unicode in paths', () => {
        expect(
          inferTitleFromPath('/library/日本語タイトル.m4b', 'single-file'),
        ).toBe('日本語タイトル');
        expect(
          inferTitleFromPath('/library/日本語フォルダ', 'multi-file'),
        ).toBe('日本語フォルダ');
      });

      it('should handle paths with brackets', () => {
        expect(
          inferTitleFromPath('/library/[Series] Book Name.m4b', 'single-file'),
        ).toBe('[Series] Book Name');
      });
    });
  });
});
