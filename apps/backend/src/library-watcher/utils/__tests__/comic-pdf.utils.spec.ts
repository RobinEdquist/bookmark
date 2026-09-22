import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import {
  formatPdfLoadError,
  readComicPdf,
  readComicPdfPage,
} from '../comic-pdf.utils';

let tmpDir: string;
let pdfPath: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-pdf-test-'));
  const doc = await PDFDocument.create();
  doc.setTitle('Embedded Title');
  doc.setAuthor('Jane Doe, John Smith');
  doc.setSubject('A short subject');
  doc.addPage([200, 300]);
  doc.addPage([200, 300]);
  doc.addPage([200, 300]);
  pdfPath = path.join(tmpDir, 'test.pdf');
  await fs.writeFile(pdfPath, await doc.save());
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('readComicPdf', () => {
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

  it('throws an actionable Unreadable PDF error on a corrupt file', async () => {
    const badPath = path.join(tmpDir, 'bad.pdf');
    await fs.writeFile(badPath, Buffer.from('not a pdf'));
    await expect(readComicPdf(badPath)).rejects.toThrow(/Unreadable PDF/i);
  });

  it('still reads a valid PDF after a corrupt-file failure (no poisoned state)', async () => {
    const badPath = path.join(tmpDir, 'bad2.pdf');
    await fs.writeFile(badPath, Buffer.from('not a pdf'));
    await expect(readComicPdf(badPath)).rejects.toThrow();

    const result = await readComicPdf(pdfPath);
    expect(result.pageCount).toBe(3);
    expect(result.coverImage).not.toBeNull();
  });

  it('extracts title, authors, and subject from PDF Info metadata', async () => {
    const result = await readComicPdf(pdfPath);
    expect(result.title).toBe('Embedded Title');
    expect(result.authors).toEqual(['Jane Doe', 'John Smith']);
    expect(result.subject).toBe('A short subject');
  });

  it('omits title/authors when Info metadata is absent (no mtime fallback)', async () => {
    const bare = await PDFDocument.create();
    bare.addPage([100, 100]);
    const barePath = path.join(tmpDir, 'bare.pdf');
    await fs.writeFile(barePath, await bare.save());

    const result = await readComicPdf(barePath);
    expect(result.pageCount).toBe(1);
    expect(result.title).toBeUndefined();
    expect(result.authors).toBeUndefined();
    expect(result.subject).toBeUndefined();
  });

});

describe('formatPdfLoadError', () => {
  it('surfaces an actionable password message', () => {
    const err = formatPdfLoadError(new Error('No password given'));
    expect(err.message).toMatch(/password/i);
    expect(err.message).toMatch(/cannot be imported/i);
  });

  it('surfaces Unreadable PDF for non-password failures', () => {
    const err = formatPdfLoadError(new Error('Invalid PDF structure'));
    expect(err.message).toMatch(/^Unreadable PDF:/);
  });
});

describe('readComicPdfPage', () => {
  it('renders a valid page index to a PNG buffer', async () => {
    const page0 = await readComicPdfPage(pdfPath, 0);
    expect(page0).not.toBeNull();
    expect(page0!.extension).toBe('.png');
    // PNG magic bytes
    expect(page0!.data.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('returns null for an out-of-range page index', async () => {
    expect(await readComicPdfPage(pdfPath, 9999)).toBeNull();
    expect(await readComicPdfPage(pdfPath, -1)).toBeNull();
  });
});
