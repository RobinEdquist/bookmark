import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { readComicPdf, readComicPdfPage } from '../comic-pdf.utils';

/**
 * Issue #115 large-fixture campaign: generate ≥300 pages / ≥50MB, then prove
 * we can open it and touch only individual pages (not the whole document raster).
 */
describe('large PDF ebook fixture', () => {
  const outPath = path.join(
    os.tmpdir(),
    `bookmark-large-ebook-${process.pid}.pdf`,
  );
  const script = path.resolve(
    __dirname,
    '../../../../scripts/generate-large-pdf-fixture.mjs',
  );

  beforeAll(() => {
    const result = spawnSync(process.execPath, [script, outPath], {
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(
        `fixture generator failed:\n${result.stderr}\n${result.stdout}`,
      );
    }
  }, 120_000);

  afterAll(async () => {
    await fs.rm(outPath, { force: true });
  });

  it('meets the documented size and page floors', async () => {
    const stat = await fs.stat(outPath);
    expect(stat.size).toBeGreaterThanOrEqual(50 * 1024 * 1024);

    const result = await readComicPdf(outPath);
    expect(result.pageCount).toBeGreaterThanOrEqual(300);
    expect(result.coverImage).not.toBeNull();
  }, 120_000);

  it('can render a middle page without requiring every page', async () => {
    const page = await readComicPdfPage(outPath, 150);
    expect(page).not.toBeNull();
    expect(page!.data.subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  }, 120_000);
});
