// Worker thread for comic metadata extraction - runs in separate thread to avoid blocking main event loop
import { parentPort } from 'worker_threads';
import * as path from 'path';
import { readComicArchive, pickCoverIndex } from '../utils/comic-archive.utils';
import { readComicPdf } from '../utils/comic-pdf.utils';
import { parseComicInfoXml, ParsedComicInfo } from '../utils/comicinfo.parser';

export interface WorkerComicFileMetadata {
  comicInfo: ParsedComicInfo | null;
  pageCount: number;
  cover: { data: number[]; mimeType: string } | null;
}

interface WorkerTask {
  type: 'extractMetadata' | 'extractCover';
  filePath: string;
  taskId: string;
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

function isPdf(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

async function extractMetadata(
  filePath: string,
): Promise<WorkerComicFileMetadata> {
  if (isPdf(filePath)) {
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
      default:
        throw new Error(`Unknown task type: ${String(task.type)}`);
    }

    return { taskId: task.taskId, success: true, result };
  } catch (error) {
    return {
      taskId: task.taskId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
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
