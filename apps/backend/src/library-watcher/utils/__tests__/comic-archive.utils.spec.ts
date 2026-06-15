import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as fsSync from 'fs';
import archiver from 'archiver';
import {
  readComicArchive,
  readComicArchivePage,
  naturalSortImageEntries,
  isImageEntry,
  pickCoverIndex,
} from '../comic-archive.utils';

// 1x1 transparent PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function buildCbz(
  filePath: string,
  entries: Array<{ name: string; data: Buffer | string }>,
  options?: { comment?: string },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fsSync.createWriteStream(filePath);
    const archive = archiver('zip', { comment: options?.comment });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    for (const entry of entries) {
      archive.append(entry.data, { name: entry.name });
    }
    void archive.finalize();
  });
}

describe('comic-archive.utils', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-archive-test-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('isImageEntry', () => {
    it.each([
      ['page01.jpg', true],
      ['page01.JPEG', true],
      ['art/page02.png', true],
      ['page.webp', true],
      ['ComicInfo.xml', false],
      ['__MACOSX/page01.jpg', false],
      ['.hidden/page.jpg', false],
      ['notes.txt', false],
    ])('%s -> %s', (name, expected) => {
      expect(isImageEntry(name)).toBe(expected);
    });
  });

  describe('naturalSortImageEntries', () => {
    it('sorts numerically, not lexically', () => {
      expect(naturalSortImageEntries(['p10.jpg', 'p2.jpg', 'p1.jpg'])).toEqual([
        'p1.jpg',
        'p2.jpg',
        'p10.jpg',
      ]);
    });
  });

  describe('pickCoverIndex', () => {
    it('uses frontCoverPageIndex when valid', () => {
      expect(pickCoverIndex(5, 2)).toBe(2);
    });
    it('accepts an explicit 0 (FrontCover is the first page)', () => {
      expect(pickCoverIndex(5, 0)).toBe(0);
    });
    it('falls back to 0 when index is null or out of range', () => {
      expect(pickCoverIndex(5, null)).toBe(0);
      expect(pickCoverIndex(5, 9)).toBe(0);
    });
  });

  describe('readComicArchive (cbz)', () => {
    it('reads page count, ComicInfo.xml and cover image', async () => {
      const cbzPath = path.join(tmpDir, 'test.cbz');
      // p1.jpg gets distinguishable bytes so we can assert the cover is the
      // natural-sort-first entry, not just any image in the archive.
      const p1Bytes = Buffer.concat([PNG_1X1, Buffer.from([0x01])]);
      await buildCbz(cbzPath, [
        { name: 'p2.jpg', data: PNG_1X1 },
        { name: 'p1.jpg', data: p1Bytes },
        { name: 'p10.jpg', data: PNG_1X1 },
        {
          name: 'ComicInfo.xml',
          data: '<ComicInfo><Series>Test</Series><Number>1</Number></ComicInfo>',
        },
      ]);

      const result = await readComicArchive(cbzPath);
      expect(result.pageCount).toBe(3);
      expect(result.comicInfoXml).toContain('<Series>Test</Series>');
      expect(result.coverImage).not.toBeNull();
      expect(result.coverImage!.data.equals(p1Bytes)).toBe(true);
    });

    it('handles archives without ComicInfo.xml', async () => {
      const cbzPath = path.join(tmpDir, 'noinfo.cbz');
      await buildCbz(cbzPath, [{ name: 'page1.png', data: PNG_1X1 }]);
      const result = await readComicArchive(cbzPath);
      expect(result.pageCount).toBe(1);
      expect(result.comicInfoXml).toBeNull();
    });

    it("reads a cbz whose end-of-central-directory is pushed past unzipper's default tail window by a long archive comment", async () => {
      // Real-world repro: some comic releases embed a ZIP archive comment a few
      // hundred bytes long. unzipper's Open.file only scans the last 80 bytes
      // for the EOCD signature by default, so the comment pushes it out of view
      // and it throws "FILE_ENDED". The comment here (~300 bytes) mirrors the
      // ~274-byte comment observed on the failing "Saga 070 (2024).cbz".
      const cbzPath = path.join(tmpDir, 'long-comment.cbz');
      await buildCbz(
        cbzPath,
        [
          { name: 'p1.jpg', data: PNG_1X1 },
          {
            name: 'ComicInfo.xml',
            data: '<ComicInfo><Series>Saga</Series><Number>70</Number></ComicInfo>',
          },
        ],
        { comment: 'x'.repeat(300) },
      );

      const result = await readComicArchive(cbzPath);
      expect(result.pageCount).toBe(1);
      expect(result.comicInfoXml).toContain('<Series>Saga</Series>');
      expect(result.coverImage).not.toBeNull();
    });

    it('throws on a corrupt archive', async () => {
      const badPath = path.join(tmpDir, 'corrupt.cbz');
      await fs.writeFile(badPath, Buffer.from('this is not a zip'));
      await expect(readComicArchive(badPath)).rejects.toThrow();
    });
  });

  describe('readComicArchivePage', () => {
    // No dedicated CBR fixture test: RAR archives can't be produced with
    // `archiver`. The CBR path (readCbrPage) mirrors the extraction convention
    // already exercised by the `readComicArchive (cbz)` cover tests via readCbr.
    it('returns the image at the given zero-based index (natural order)', async () => {
      const file = path.join(tmpDir, 'pages.cbz');
      await buildCbz(file, [
        { name: 'p1.jpg', data: Buffer.from('PAGE-ONE') },
        { name: 'p2.jpg', data: Buffer.from('PAGE-TWO') },
        { name: 'p10.jpg', data: Buffer.from('PAGE-TEN') },
        { name: 'ComicInfo.xml', data: '<ComicInfo></ComicInfo>' },
      ]);

      const page0 = await readComicArchivePage(file, 0);
      const page2 = await readComicArchivePage(file, 2);

      expect(page0?.data.toString()).toBe('PAGE-ONE');
      // natural sort puts p10 last, so index 2 is p10
      expect(page2?.data.toString()).toBe('PAGE-TEN');
      expect(page0?.extension).toBe('.jpg');
    });

    it('returns null for an out-of-range index', async () => {
      const file = path.join(tmpDir, 'oob.cbz');
      await buildCbz(file, [{ name: 'only.jpg', data: PNG_1X1 }]);

      expect(await readComicArchivePage(file, 5)).toBeNull();
      expect(await readComicArchivePage(file, -1)).toBeNull();
    });
  });
});
