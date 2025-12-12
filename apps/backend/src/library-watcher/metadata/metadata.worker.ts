// Worker thread for metadata extraction - runs in separate thread to avoid blocking main event loop
import { parentPort, workerData } from 'worker_threads';
import * as mm from 'music-metadata';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ExtractedMetadata {
  title?: string;
  subtitle?: string;
  author?: string;
  narrator?: string;
  description?: string;
  publisher?: string;
  publishedDate?: string;
  language?: string;
  genres?: string[];
  series?: string;
  seriesOrder?: string;
  hasEmbeddedCover?: boolean;
  duration?: number;
  format?: string;
  bitrate?: number;
  sampleRate?: number;
}

interface AudioFileInfo {
  filePath: string;
  fileName: string;
  duration: number;
  format: string;
  bitrate?: number;
  sampleRate?: number;
  sizeBytes: number;
}

interface Chapter {
  title: string;
  startTime: number;
  endTime?: number;
}

interface FullMetadataResult {
  metadata: ExtractedMetadata;
  fileInfo: AudioFileInfo;
  chapters: Chapter[];
}

interface WorkerTask {
  type: 'extractFullMetadata' | 'getFileInfo' | 'extractCover';
  filePath: string;
  taskId: string;
}

interface WorkerResponse {
  taskId: string;
  success: boolean;
  result?:
    | FullMetadataResult
    | AudioFileInfo
    | { data: number[]; mimeType: string }
    | null;
  error?: string;
}

async function extractChaptersFromParsedMetadata(
  mmMetadata: mm.IAudioMetadata,
  filePath: string,
): Promise<Chapter[]> {
  try {
    const sampleRate = mmMetadata.format.sampleRate || 44100;

    // Check format.chapters (works for M4B/M4A/MP4 files with chapter tracks)
    if (mmMetadata.format.chapters && mmMetadata.format.chapters.length > 0) {
      return mmMetadata.format.chapters.map((chap, index: number) => ({
        title: chap.title || `Chapter ${index + 1}`,
        startTime: Math.round(chap.sampleOffset / sampleRate),
        endTime: undefined,
      }));
    }

    // Try ID3v2.4 CHAP tags (for MP3 files with chapters)
    const id3Chapters =
      mmMetadata.native?.['ID3v2.4']?.filter((tag) => tag.id === 'CHAP') || [];
    if (id3Chapters.length > 0) {
      return id3Chapters.map((chap, index: number) => {
        const value = chap.value as {
          startTime: number;
          endTime?: number;
          title?: string;
        };
        return {
          title: value.title || `Chapter ${index + 1}`,
          startTime: Math.round(value.startTime / 1000),
          endTime: value.endTime ? Math.round(value.endTime / 1000) : undefined,
        };
      });
    }

    // Fallback: Try ffprobe for M4B/M4A files (handles more chapter formats)
    const ext = path.extname(filePath).toLowerCase();
    if (['.m4b', '.m4a', '.mp4'].includes(ext)) {
      const ffprobeChapters = await extractChaptersWithFfprobe(filePath);
      if (ffprobeChapters.length > 0) {
        return ffprobeChapters;
      }
    }

    return [];
  } catch {
    return [];
  }
}

async function extractChaptersWithFfprobe(
  filePath: string,
): Promise<Chapter[]> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_chapters "${filePath.replace(/"/g, '\\"')}"`,
      { maxBuffer: 10 * 1024 * 1024 },
    );

    const data = JSON.parse(stdout);

    if (!data.chapters || data.chapters.length === 0) {
      return [];
    }

    return data.chapters.map(
      (
        chap: {
          start_time?: string;
          end_time?: string;
          tags?: { title?: string };
        },
        index: number,
      ) => ({
        title: chap.tags?.title || `Chapter ${index + 1}`,
        startTime: Math.round(parseFloat(chap.start_time || '0')),
        endTime: chap.end_time
          ? Math.round(parseFloat(chap.end_time))
          : undefined,
      }),
    );
  } catch {
    return [];
  }
}

async function extractFullMetadata(
  filePath: string,
): Promise<FullMetadataResult> {
  // Parse without chapters first - this is more reliable and avoids
  // music-metadata errors with malformed chapter atoms in some M4B files
  const mmMetadata = await mm.parseFile(filePath, { includeChapters: false });
  const { common, format } = mmMetadata;
  const stats = await fs.stat(filePath);

  const metadata: ExtractedMetadata = {
    title: common.title || undefined,
    subtitle: common.subtitle?.[0] || undefined,
    author: common.artist || common.albumartist || undefined,
    narrator: common.composer?.[0] || undefined,
    description: common.comment?.[0]?.text || undefined,
    publisher: common.label?.[0] || undefined,
    // Validate year is a finite number - NaN.toString() returns "NaN" string
    publishedDate:
      common.year && Number.isFinite(common.year)
        ? common.year.toString()
        : undefined,
    language: common.language || undefined,
    genres: common.genre || undefined,
    series: common.grouping || undefined,
    hasEmbeddedCover: common.picture && common.picture.length > 0,
    duration: format.duration ? Math.round(format.duration) : undefined,
    format: format.container || undefined,
    bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
    sampleRate: format.sampleRate || undefined,
  };

  const fileInfo: AudioFileInfo = {
    filePath,
    fileName: path.basename(filePath),
    duration: format.duration ? Math.round(format.duration) : 0,
    format: format.container || path.extname(filePath).slice(1),
    bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
    sampleRate: format.sampleRate || undefined,
    sizeBytes: stats.size,
  };

  // Try to extract chapters - failures here shouldn't fail the whole import
  let chapters: Chapter[] = [];
  try {
    // Try music-metadata with chapters enabled
    const mmWithChapters = await mm.parseFile(filePath, {
      includeChapters: true,
    });
    chapters = await extractChaptersFromParsedMetadata(
      mmWithChapters,
      filePath,
    );
  } catch {
    // music-metadata chapter parsing failed (e.g., "Expected equal chunk-offset-table
    // & sample-size-table length" or "Chapter chunk exceeding token length")
    // Fall back to ffprobe for chapter extraction
    const ext = path.extname(filePath).toLowerCase();
    if (['.m4b', '.m4a', '.mp4'].includes(ext)) {
      chapters = await extractChaptersWithFfprobe(filePath);
    }
  }

  return { metadata, fileInfo, chapters };
}

async function getFileInfo(filePath: string): Promise<AudioFileInfo> {
  const metadata = await mm.parseFile(filePath);
  const stats = await fs.stat(filePath);

  return {
    filePath,
    fileName: path.basename(filePath),
    duration: metadata.format.duration
      ? Math.round(metadata.format.duration)
      : 0,
    format: metadata.format.container || path.extname(filePath).slice(1),
    bitrate: metadata.format.bitrate
      ? Math.round(metadata.format.bitrate / 1000)
      : undefined,
    sampleRate: metadata.format.sampleRate || undefined,
    sizeBytes: stats.size,
  };
}

async function extractCover(
  filePath: string,
): Promise<{ data: number[]; mimeType: string } | null> {
  const metadata = await mm.parseFile(filePath);
  const picture = metadata.common.picture?.[0];

  if (!picture) {
    return null;
  }

  return {
    data: Array.from(picture.data),
    mimeType: picture.format || 'image/jpeg',
  };
}

async function handleTask(task: WorkerTask): Promise<WorkerResponse> {
  try {
    let result:
      | FullMetadataResult
      | AudioFileInfo
      | { data: number[]; mimeType: string }
      | null;

    switch (task.type) {
      case 'extractFullMetadata':
        result = await extractFullMetadata(task.filePath);
        break;
      case 'getFileInfo':
        result = await getFileInfo(task.filePath);
        break;
      case 'extractCover':
        result = await extractCover(task.filePath);
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
    parentPort!.postMessage(response);
  });
}

// If run with workerData (single task mode)
if (workerData) {
  handleTask(workerData as WorkerTask).then((response) => {
    if (parentPort) {
      parentPort.postMessage(response);
    }
  });
}
