import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { readComicPdf } from '../comic-pdf.utils';

describe('readComicPdf', () => {
  let tmpDir: string;
  let pdfPath: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-pdf-test-'));
    const doc = await PDFDocument.create();
    doc.addPage([200, 300]);
    doc.addPage([200, 300]);
    doc.addPage([200, 300]);
    pdfPath = path.join(tmpDir, 'test.pdf');
    await fs.writeFile(pdfPath, await doc.save());
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns the page count', async () => {
    const result = await readComicPdf(pdfPath);
    expect(result.pageCount).toBe(3);
  });

  it('renders the first page to a PNG buffer', async () => {
    const result = await readComicPdf(pdfPath);
    expect(result.coverImage).not.toBeNull();
    // PNG magic bytes
    expect(result.coverImage!.data.subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it('throws on a corrupt PDF', async () => {
    const badPath = path.join(tmpDir, 'bad.pdf');
    await fs.writeFile(badPath, Buffer.from('not a pdf'));
    await expect(readComicPdf(badPath)).rejects.toThrow();
  });
});
