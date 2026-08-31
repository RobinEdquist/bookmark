import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { buildZip, type ZipEntrySpec } from '@test-utils';
import { extractZipSafely } from '../safe-zip-extract.util';

// ---------------------------------------------------------------------------
// Tests (real filesystem — no fs mocks). Archives are built with the shared
// minimal zip writer in __test-utils__/zip-builder.ts.
// ---------------------------------------------------------------------------

describe('extractZipSafely', () => {
  let workDir: string;
  let destination: string;

  beforeEach(async () => {
    workDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'safe-zip-spec-'),
    );
    destination = path.join(workDir, 'extracted');
    await fsPromises.mkdir(destination, { recursive: true });
  });

  afterAll(async () => {
    await fsPromises.rm(workDir, { recursive: true, force: true });
  });

  async function writeAndExtract(
    entries: ZipEntrySpec[],
    options?: Parameters<typeof extractZipSafely>[2],
  ): Promise<void> {
    const zipPath = path.join(
      workDir,
      `archive-${Date.now()}-${Math.random()}.zip`,
    );
    await fsPromises.writeFile(zipPath, buildZip(entries));
    await extractZipSafely(zipPath, destination, options);
  }

  it('extracts nested files and directory entries', async () => {
    await writeAndExtract([
      { path: 'metadata-items/' },
      { path: 'metadata-items/book-1/cover.jpg', data: Buffer.from('cover') },
      { path: 'absdatabase.sqlite', data: Buffer.from('sqlite-bytes') },
    ]);

    expect(
      await fsPromises.readFile(
        path.join(destination, 'metadata-items/book-1/cover.jpg'),
        'utf8',
      ),
    ).toBe('cover');
    expect(
      await fsPromises.readFile(
        path.join(destination, 'absdatabase.sqlite'),
        'utf8',
      ),
    ).toBe('sqlite-bytes');
  });

  it('inflates deflated entries correctly', async () => {
    const content = Buffer.from('hello deflate world '.repeat(100));
    await writeAndExtract([{ path: 'data.txt', data: content, method: 8 }]);

    expect(
      await fsPromises.readFile(path.join(destination, 'data.txt')),
    ).toEqual(content);
  });

  it.each(['../evil.txt', 'a/../../evil.txt', '/etc/evil.txt', '..\\evil.txt'])(
    'rejects escaping entry path %j',
    async (entryPath) => {
      await expect(
        writeAndExtract([{ path: entryPath, data: Buffer.from('x') }]),
      ).rejects.toThrow(BadRequestException);

      // Nothing written outside the destination (ignore the archive itself)
      const siblings = (await fsPromises.readdir(workDir)).filter(
        (name) => name !== 'extracted' && !name.endsWith('.zip'),
      );
      expect(siblings).toHaveLength(0);
      const extracted = await fsPromises.readdir(destination);
      expect(extracted).toHaveLength(0);
    },
  );

  it('rejects archives with more entries than the configured cap', async () => {
    await expect(
      writeAndExtract(
        [
          { path: 'a.txt', data: Buffer.from('a') },
          { path: 'b.txt', data: Buffer.from('b') },
          { path: 'c.txt', data: Buffer.from('c') },
        ],
        { maxEntries: 2 },
      ),
    ).rejects.toThrow('too many files');

    const extracted = await fsPromises.readdir(destination);
    expect(extracted).toHaveLength(0);
  });

  it('rejects archives whose declared size exceeds the budget', async () => {
    await expect(
      writeAndExtract([{ path: 'a.txt', data: Buffer.from('a') }], {
        maxUncompressedBytes: 0,
      }),
    ).rejects.toThrow('too large');
  });

  it('enforces the budget against actually inflated bytes when declared sizes lie', async () => {
    // 1 MB of zeros deflates to ~1 KB. The headers declare an uncompressed
    // size of 16 bytes — under the budget — but real inflation exceeds it.
    const big = Buffer.alloc(1024 * 1024, 0);
    await expect(
      writeAndExtract(
        [
          {
            path: 'bomb.bin',
            data: big,
            method: 8,
            declaredUncompressedSize: 16,
          },
        ],
        { maxUncompressedBytes: 1000 },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not overwrite an existing file when the archive duplicates a name', async () => {
    const target = path.join(destination, 'existing.txt');
    await fsPromises.writeFile(target, 'original');

    await expect(
      writeAndExtract([{ path: 'existing.txt', data: Buffer.from('new') }]),
    ).rejects.toThrow();

    expect(await fsPromises.readFile(target, 'utf8')).toBe('original');
  });
});
