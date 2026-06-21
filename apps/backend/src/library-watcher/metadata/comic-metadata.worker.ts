// Worker thread for comic metadata extraction - runs in separate thread to avoid blocking main event loop
import { parentPort } from 'worker_threads';
import * as path from 'path';
import {
  readComicArchive,
  pickCoverIndex,
  readComicArchivePage,
  detectComicContainer,
} from '../utils/comic-archive.utils';
import { readComicPdf, readComicPdfPage } from '../utils/comic-pdf.utils';
import { parseComicInfoXml, ParsedComicInfo } from '../utils/comicinfo.parser';

export interface WorkerComicFileMetadata {
  comicInfo: ParsedComicInfo | null;
  pageCount: number;
  cover: { data: number[]; mimeType: string } | null;
}

interface WorkerTask {
  type: 'extractMetadata' | 'extractCover' | 'extractPage';
  filePath: string;
  taskId: string;
  pageIndex?: number;
}

interface WorkerResponse {
  taskId: string;
  success: boolean;
  result?:
    | WorkerComicFileMetadata
    | { data: number[]; mimeType: string }
    | null;
  error?: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

// Route by content, not extension: a PDF named ".cbr" must still be read as a
// PDF (and a real archive named ".pdf" as an archive). Fall back to the
// extension only when the bytes are unrecognized.
async function isPdf(filePath: string): Promise<boolean> {
  const detected = await detectComicContainer(filePath);
  if (detected) return detected === 'pdf';
  return path.extname(filePath).toLowerCase() === '.pdf';
}

async function extractMetadata(
  filePath: string,
): Promise<WorkerComicFileMetadata> {
  if (await isPdf(filePath)) {
    const pdf = await readComicPdf(filePath);
    return {
      comicInfo: null,
      pageCount: pdf.pageCount,
      cover: pdf.coverImage
        ? {
            data: Array.from(pdf.coverImage.data),
            mimeType:
              MIME_BY_EXTENSION[pdf.coverImage.extension] ?? 'image/png',
          }
        : null,
    };
  }

  // First pass: read with default cover (first image) + ComicInfo.xml
  const archive = await readComicArchive(filePath);
  let comicInfo: ParsedComicInfo | null = null;
  if (archive.comicInfoXml) {
    comicInfo = parseComicInfoXml(archive.comicInfoXml);
  }

  // If ComicInfo declares a different FrontCover page, re-read that page
  let cover = archive.coverImage;
  const coverIndex = pickCoverIndex(
    archive.pageCount,
    comicInfo?.frontCoverPageIndex ?? null,
  );
  if (coverIndex !== 0) {
    const reread = await readComicArchive(filePath, coverIndex);
    cover = reread.coverImage ?? cover;
  }

  return {
    comicInfo,
    pageCount: comicInfo?.pageCount ?? archive.pageCount,
    cover: cover
      ? {
          data: Array.from(cover.data),
          mimeType: MIME_BY_EXTENSION[cover.extension] ?? 'image/jpeg',
        }
      : null,
  };
}

async function extractCover(
  filePath: string,
): Promise<{ data: number[]; mimeType: string } | null> {
  const metadata = await extractMetadata(filePath);
  return metadata.cover;
}

async function extractPage(
  filePath: string,
  pageIndex: number,
): Promise<{ data: number[]; mimeType: string } | null> {
  console.log(
    `[comic-worker] extractPage filePath=${filePath} pageIndex=${pageIndex}`,
  );
  if (await isPdf(filePath)) {
    const page = await readComicPdfPage(filePath, pageIndex);
    if (!page) {
      console.warn(
        `[comic-worker] extractPage null (out-of-range or empty) filePath=${filePath} pageIndex=${pageIndex}`,
      );
      return null;
    }
    console.log(
      `[comic-worker] extractPage done (pdf) filePath=${filePath} pageIndex=${pageIndex} bytes=${page.data.length}`,
    );
    return { data: Array.from(page.data), mimeType: 'image/png' };
  }
  const page = await readComicArchivePage(filePath, pageIndex);
  if (!page) {
    console.warn(
      `[comic-worker] extractPage null (out-of-range or empty) filePath=${filePath} pageIndex=${pageIndex}`,
    );
    return null;
  }
  console.log(
    `[comic-worker] extractPage done (archive) filePath=${filePath} pageIndex=${pageIndex} bytes=${page.data.length} mimeType=${MIME_BY_EXTENSION[page.extension] ?? 'image/jpeg'}`,
  );
  return {
    data: Array.from(page.data),
    mimeType: MIME_BY_EXTENSION[page.extension] ?? 'image/jpeg',
  };
}

async function handleTask(task: WorkerTask): Promise<WorkerResponse> {
  try {
    let result:
      | WorkerComicFileMetadata
      | { data: number[]; mimeType: string }
      | null;

    switch (task.type) {
      case 'extractMetadata':
        result = await extractMetadata(task.filePath);
        break;
      case 'extractCover':
        result = await extractCover(task.filePath);
        break;
      case 'extractPage':
        result = await extractPage(task.filePath, task.pageIndex ?? 0);
        break;
      default:
        throw new Error(`Unknown task type: ${String(task.type)}`);
    }

    return { taskId: task.taskId, success: true, result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.warn(
      `[comic-worker] handleTask failed type=${task.type} filePath=${task.filePath} pageIndex=${task.pageIndex ?? 'n/a'}: ${msg}`,
      stack ?? '',
    );
    return {
      taskId: task.taskId,
      success: false,
      error: msg,
    };
  }
}

// Handle messages from main thread
if (parentPort) {
  parentPort.on('message', async (task: WorkerTask) => {
    const response = await handleTask(task);
    parentPort!.postMessage(response);
  });
}
