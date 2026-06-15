// apps/backend/src/library-watcher/utils/comic-archive.utils.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as unzipper from 'unzipper';
import { createExtractorFromData } from 'node-unrar-js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];

export interface ComicArchiveContents {
  /** Number of image pages in the archive */
  pageCount: number;
  /** Raw ComicInfo.xml content, if present */
  comicInfoXml: string | null;
  /** The selected cover image (see coverIndex param of readComicArchive) */
  coverImage: { data: Buffer; extension: string } | null;
}

export function isImageEntry(entryName: string): boolean {
  const normalized = entryName.replace(/\\/g, '/');
  if (normalized.startsWith('__MACOSX/')) return false;
  const segments = normalized.split('/');
  if (segments.some((s) => s.startsWith('.'))) return false;
  const ext = path.extname(normalized).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

export function naturalSortImageEntries(names: string[]): string[] {
  return [...names].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

export function pickCoverIndex(
  pageCount: number,
  frontCoverPageIndex: number | null,
): number {
  if (
    frontCoverPageIndex !== null &&
    frontCoverPageIndex >= 0 &&
    frontCoverPageIndex < pageCount
  ) {
    return frontCoverPageIndex;
  }
  return 0;
}

function isComicInfoEntry(entryName: string): boolean {
  const normalized = entryName.replace(/\\/g, '/');
  return path.basename(normalized).toLowerCase() === 'comicinfo.xml';
}

/**
 * Read a CBZ/CBR archive: page count, ComicInfo.xml, and cover image.
 * Throws on unreadable/corrupt archives (callers quarantine).
 * @param coverIndex index into the natural-sorted image list (default 0)
 */
export async function readComicArchive(
  filePath: string,
  coverIndex = 0,
): Promise<ComicArchiveContents> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.cbr' || ext === '.rar') {
    return readCbr(filePath, coverIndex);
  }
  return readCbz(filePath, coverIndex);
}

// Max ZIP archive comment is 65535 bytes (2-byte length field) plus the 22-byte
// End-Of-Central-Directory record. unzipper's Open.file defaults to scanning
// only the last 80 bytes for the EOCD signature, so any archive with a comment
// longer than ~58 bytes throws "FILE_ENDED". Some comic releases embed a few
// hundred bytes of comment, so we widen the scan window to cover any spec-valid
// comment.
const ZIP_EOCD_TAIL_SIZE = 65535 + 22;

async function readCbz(
  filePath: string,
  coverIndex: number,
): Promise<ComicArchiveContents> {
  const directory = await unzipper.Open.file(filePath, {
    tailSize: ZIP_EOCD_TAIL_SIZE,
  });
  const fileEntries = directory.files.filter((f) => f.type === 'File');

  const imageNames = naturalSortImageEntries(
    fileEntries.map((f) => f.path).filter(isImageEntry),
  );

  let comicInfoXml: string | null = null;
  const infoEntry = fileEntries.find((f) => isComicInfoEntry(f.path));
  if (infoEntry) {
    comicInfoXml = (await infoEntry.buffer()).toString('utf-8');
  }

  let coverImage: { data: Buffer; extension: string } | null = null;
  if (imageNames.length > 0) {
    const targetName = imageNames[Math.min(coverIndex, imageNames.length - 1)];
    const coverEntry = fileEntries.find((f) => f.path === targetName);
    if (coverEntry) {
      coverImage = {
        data: await coverEntry.buffer(),
        extension: path.extname(targetName).toLowerCase(),
      };
    }
  }

  return { pageCount: imageNames.length, comicInfoXml, coverImage };
}

async function readCbr(
  filePath: string,
  coverIndex: number,
): Promise<ComicArchiveContents> {
  // node-unrar-js requires the entire archive in memory (no streaming API).
  const buf = await fs.readFile(filePath);
  // node-unrar-js requires a plain ArrayBuffer (not Buffer/SharedArrayBuffer)
  // Deviation: use buf.buffer.slice(...) with explicit cast to ArrayBuffer,
  // because Node Buffer's underlying buffer may be shared and need slicing.
  const data = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;

  // createExtractorFromData returns Extractor<Uint8Array>
  // getFileList().fileHeaders is a Generator<FileHeader>
  const extractor = await createExtractorFromData({ data });

  const list = extractor.getFileList();
  // Spread the Generator into an array and filter out directories
  // FileHeader.flags.directory is the correct property name per the real .d.ts
  const headers = [...list.fileHeaders].filter((h) => !h.flags.directory);

  const imageNames = naturalSortImageEntries(
    headers.map((h) => h.name).filter(isImageEntry),
  );

  const wanted: string[] = [];
  const infoHeader = headers.find((h) => isComicInfoEntry(h.name));
  if (infoHeader) wanted.push(infoHeader.name);
  let coverName: string | null = null;
  if (imageNames.length > 0) {
    coverName = imageNames[Math.min(coverIndex, imageNames.length - 1)];
    wanted.push(coverName);
  }

  let comicInfoXml: string | null = null;
  let coverImage: { data: Buffer; extension: string } | null = null;

  if (wanted.length > 0) {
    // extract().files is a Generator<ArcFile<Uint8Array>>
    // ArcFile.extraction is Uint8Array when present
    const extracted = extractor.extract({ files: wanted });
    for (const file of extracted.files) {
      if (!file.extraction) continue;
      // Convert Uint8Array to Buffer
      const content = Buffer.from(file.extraction);
      if (infoHeader && file.fileHeader.name === infoHeader.name) {
        comicInfoXml = content.toString('utf-8');
      }
      if (coverName && file.fileHeader.name === coverName) {
        coverImage = {
          data: content,
          extension: path.extname(coverName).toLowerCase(),
        };
      }
    }
  }

  return { pageCount: imageNames.length, comicInfoXml, coverImage };
}

export interface ExtractedPage {
  data: Buffer;
  extension: string;
}

/**
 * Extract a single image page (zero-based index into the natural-sorted image
 * list) from a CBZ/CBR archive. Returns null if the index is out of range.
 * PDF files are not handled here; PDF page rendering is a separate util.
 */
export async function readComicArchivePage(
  filePath: string,
  pageIndex: number,
): Promise<ExtractedPage | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.cbr' || ext === '.rar') {
    return readCbrPage(filePath, pageIndex);
  }
  return readCbzPage(filePath, pageIndex);
}

async function readCbzPage(
  filePath: string,
  pageIndex: number,
): Promise<ExtractedPage | null> {
  const directory = await unzipper.Open.file(filePath, {
    tailSize: ZIP_EOCD_TAIL_SIZE,
  });
  const fileEntries = directory.files.filter((f) => f.type === 'File');
  const imageNames = naturalSortImageEntries(
    fileEntries.map((f) => f.path).filter(isImageEntry),
  );
  if (pageIndex < 0 || pageIndex >= imageNames.length) return null;
  const targetName = imageNames[pageIndex];
  const entry = fileEntries.find((f) => f.path === targetName);
  if (!entry) return null;
  return {
    data: await entry.buffer(),
    extension: path.extname(targetName).toLowerCase(),
  };
}

async function readCbrPage(
  filePath: string,
  pageIndex: number,
): Promise<ExtractedPage | null> {
  const buf = await fs.readFile(filePath);
  const data = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
  const extractor = await createExtractorFromData({ data });
  const list = extractor.getFileList();
  // Spread the Generator into an array and filter out directories
  const headers = [...list.fileHeaders].filter((h) => !h.flags.directory);
  const imageNames = naturalSortImageEntries(
    headers.map((h) => h.name).filter(isImageEntry),
  );
  if (pageIndex < 0 || pageIndex >= imageNames.length) return null;
  const targetName = imageNames[pageIndex];
  const extracted = extractor.extract({ files: [targetName] });
  for (const file of extracted.files) {
    if (file.extraction && file.fileHeader.name === targetName) {
      return {
        data: Buffer.from(file.extraction),
        extension: path.extname(targetName).toLowerCase(),
      };
    }
  }
  return null;
}
