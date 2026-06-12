import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as fsSync from 'fs';
import archiver from 'archiver';
import {
  readComicArchive,
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
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fsSync.createWriteStream(filePath);
    const archive = archiver('zip');
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
    it('falls back to 0 when index is null or out of range', () => {
      expect(pickCoverIndex(5, null)).toBe(0);
      expect(pickCoverIndex(5, 9)).toBe(0);
    });
  });

  describe('readComicArchive (cbz)', () => {
    it('reads page count, ComicInfo.xml and cover image', async () => {
      const cbzPath = path.join(tmpDir, 'test.cbz');
      await buildCbz(cbzPath, [
        { name: 'p2.jpg', data: PNG_1X1 },
        { name: 'p1.jpg', data: PNG_1X1 },
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
      expect(result.coverImage!.data.length).toBeGreaterThan(0);
    });

    it('handles archives without ComicInfo.xml', async () => {
      const cbzPath = path.join(tmpDir, 'noinfo.cbz');
      await buildCbz(cbzPath, [{ name: 'page1.png', data: PNG_1X1 }]);
      const result = await readComicArchive(cbzPath);
      expect(result.pageCount).toBe(1);
      expect(result.comicInfoXml).toBeNull();
    });

    it('throws on a corrupt archive', async () => {
      const badPath = path.join(tmpDir, 'corrupt.cbz');
      await fs.writeFile(badPath, Buffer.from('this is not a zip'));
      await expect(readComicArchive(badPath)).rejects.toThrow();
    });
  });
});
