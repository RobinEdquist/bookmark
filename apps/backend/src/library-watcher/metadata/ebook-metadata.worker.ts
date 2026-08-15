// Worker thread for ebook metadata extraction - runs in separate thread to avoid blocking main event loop
import { parentPort } from 'worker_threads';
import * as path from 'path';
import EPub from 'epub2';
import {
  htmlToPlainText,
  firstHeadingText,
} from '../../tts/utils/html-to-text';
import { planChapters } from '../../tts/utils/chapter-filter';
import {
  copyToTransferableBytes,
  responseTransferList,
} from '../../common/utils/worker-bytes.util';

interface EbookMetadata {
  title: string;
  subtitle?: string;
  description?: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  language?: string;
  isbn?: string;
  pageCount?: number;
  cover?: {
    data: Uint8Array;
    mimeType: string;
  };
}

interface ExtractedChapter {
  title: string;
  text: string;
  characters: number;
}

interface ExtractedChapters {
  language?: string;
  chapters: ExtractedChapter[];
}

interface WorkerTask {
  type: 'extractMetadata' | 'extractCover' | 'extractChapters';
  filePath: string;
  taskId: string;
}

interface WorkerResponse {
  taskId: string;
  success: boolean;
  result?:
    | EbookMetadata
    | ExtractedChapters
    | { data: Uint8Array; mimeType: string }
    | null;
  error?: string;
}

function cleanDescription(description?: string): string | undefined {
  if (!description) return undefined;

  // Remove HTML tags
  let cleaned = description.replace(/<[^>]*>/g, '');
  // Decode HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned || undefined;
}

async function extractCoverFromEpub(
  epub: EPub,
): Promise<{ data: Uint8Array; mimeType: string } | null> {
  return new Promise((resolve) => {
    // Try to get cover from manifest
    const coverId = epub.metadata.cover;
    if (!coverId) {
      // Try common cover IDs
      const manifest = epub.manifest;
      const possibleCoverIds = [
        'cover',
        'cover-image',
        'coverimage',
        'cover_image',
      ];
      let foundId: string | undefined;

      for (const id of possibleCoverIds) {
        if (manifest[id]) {
          foundId = id;
          break;
        }
      }

      // Also try to find by media-type
      if (!foundId) {
        for (const [id, item] of Object.entries(manifest)) {
          const itemObj = item as { 'media-type'?: string; href?: string };
          if (
            itemObj['media-type']?.startsWith('image/') &&
            (id.toLowerCase().includes('cover') ||
              itemObj.href?.toLowerCase().includes('cover'))
          ) {
            foundId = id;
            break;
          }
        }
      }

      if (!foundId) {
        resolve(null);
        return;
      }

      epub.getImage(foundId, (error, data, mimeType) => {
        if (error || !data) {
          resolve(null);
          return;
        }
        resolve({
          data: copyToTransferableBytes(data),
          mimeType: mimeType || 'image/jpeg',
        });
      });
    } else {
      epub.getImage(coverId, (error, data, mimeType) => {
        if (error || !data) {
          resolve(null);
          return;
        }
        resolve({
          data: copyToTransferableBytes(data),
          mimeType: mimeType || 'image/jpeg',
        });
      });
    }
  });
}

async function extractMetadata(filePath: string): Promise<EbookMetadata> {
  try {
    const epub = await EPub.createAsync(filePath);
    const metadata = epub.metadata;

    // Extract title - may have subtitle after a colon or dash
    let title =
      metadata.title || path.basename(filePath, path.extname(filePath));
    let subtitle: string | undefined;

    // Try to extract subtitle from title
    const colonIndex = title.indexOf(':');
    const dashIndex = title.indexOf(' - ');
    if (colonIndex > 0) {
      subtitle = title.substring(colonIndex + 1).trim();
      title = title.substring(0, colonIndex).trim();
    } else if (dashIndex > 0) {
      subtitle = title.substring(dashIndex + 3).trim();
      title = title.substring(0, dashIndex).trim();
    }

    // Extract authors - may be comma-separated or in an array
    let authors: string[] = [];
    if (metadata.creator) {
      if (typeof metadata.creator === 'string') {
        authors = metadata.creator
          .split(/[,&]/)
          .map((a: string) => a.trim())
          .filter(Boolean);
      } else if (Array.isArray(metadata.creator)) {
        authors = metadata.creator.map((a: string) => a.trim()).filter(Boolean);
      }
    }

    // Extract cover
    let cover: { data: Uint8Array; mimeType: string } | undefined;
    try {
      const coverResult = await extractCoverFromEpub(epub);
      if (coverResult) {
        cover = coverResult;
      }
    } catch {
      // Cover extraction failed, continue without it
    }

    // Extract ISBN from identifiers
    let isbn: string | undefined;
    if (metadata.ISBN) {
      isbn = metadata.ISBN;
    } else if (metadata.identifier) {
      // Try to extract ISBN from identifier
      const identifier = metadata.identifier;
      if (
        typeof identifier === 'string' &&
        identifier.match(/^(97[89])?\d{9}[\dXx]$/)
      ) {
        isbn = identifier;
      }
    }

    return {
      title,
      subtitle,
      description: cleanDescription(metadata.description),
      authors,
      publisher: metadata.publisher,
      publishedDate: metadata.date,
      language: metadata.language,
      isbn,
      cover,
    };
  } catch {
    // Return minimal metadata based on filename
    const fileName = path.basename(filePath, path.extname(filePath));
    return {
      title: fileName,
      authors: [],
    };
  }
}

async function extractCover(
  filePath: string,
): Promise<{ data: Uint8Array; mimeType: string } | null> {
  try {
    const epub = await EPub.createAsync(filePath);
    return await extractCoverFromEpub(epub);
  } catch {
    return null;
  }
}

// Pages with less text than this are dropped (image pages, blanks, part
// separators) - they aren't worth narrating as standalone chapters.
const MIN_CHAPTER_CHARS = 250;

/** Plain-text chapters for TTS narration, in reading order. */
async function extractChapters(filePath: string): Promise<ExtractedChapters> {
  const epub = await EPub.createAsync(filePath);
  const planned = planChapters(epub.flow ?? [], epub.toc ?? []);

  const chapters: ExtractedChapter[] = [];
  for (const plan of planned) {
    let html = '';
    for (const flowId of plan.flowIds) {
      try {
        html += await epub.getChapterAsync(flowId);
      } catch {
        // Unreadable spine item - narrate what we have
      }
    }

    const text = htmlToPlainText(html);
    if (text.length < MIN_CHAPTER_CHARS) continue;

    const title =
      plan.title ?? firstHeadingText(html) ?? `Chapter ${chapters.length + 1}`;
    chapters.push({ title, text, characters: text.length });
  }

  return { language: epub.metadata.language, chapters };
}

async function handleTask(task: WorkerTask): Promise<WorkerResponse> {
  try {
    let result:
      | EbookMetadata
      | ExtractedChapters
      | { data: Uint8Array; mimeType: string }
      | null;

    switch (task.type) {
      case 'extractMetadata':
        result = await extractMetadata(task.filePath);
        break;
      case 'extractCover':
        result = await extractCover(task.filePath);
        break;
      case 'extractChapters':
        result = await extractChapters(task.filePath);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
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
    parentPort!.postMessage(response, responseTransferList(response.result));
  });
}
