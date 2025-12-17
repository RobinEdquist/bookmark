// Worker thread for metadata extraction - runs in separate thread to avoid blocking main event loop
import { parentPort, workerData } from 'worker_threads';
import MediaInfoFactory, {
  type MediaInfo,
  type MediaInfoResult,
} from 'mediainfo.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ExtractedMetadata {
  title?: string;
  album?: string;
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

// Lazy-initialize MediaInfo instance (reusable across tasks)
let mediaInfoInstance: MediaInfo | null = null;

async function getMediaInfo(): Promise<MediaInfo> {
  if (!mediaInfoInstance) {
    mediaInfoInstance = await MediaInfoFactory({
      format: 'object',
      coverData: true,
    });
  }
  return mediaInfoInstance;
}

/**
 * Analyze a file using mediainfo.js
 */
async function analyzeFile(filePath: string): Promise<MediaInfoResult> {
  const mediaInfo = await getMediaInfo();
  const fileHandle = await fs.open(filePath, 'r');
  const fileSize = (await fileHandle.stat()).size;

  const readChunk = async (
    size: number,
    offset: number,
  ): Promise<Uint8Array> => {
    const buffer = new Uint8Array(size);
    await fileHandle.read(buffer, 0, size, offset);
    return buffer;
  };

  try {
    const result = await mediaInfo.analyzeData(() => fileSize, readChunk);
    return result as MediaInfoResult;
  } finally {
    await fileHandle.close();
  }
}

// Type definitions for mediainfo.js result structure
interface MediaInfoTrack {
  '@type': 'General' | 'Audio' | 'Video' | 'Image' | 'Text' | 'Menu';
  // General track fields
  Title?: string;
  Album?: string;
  Track?: string;
  Performer?: string;
  Artist?: string;
  AlbumPerformer?: string;
  Composer?: string;
  Description?: string;
  Comment?: string;
  Publisher?: string;
  Label?: string;
  Genre?: string;
  Recorded_Date?: string;
  Released_Date?: string;
  Original_Released_Date?: string;
  Language?: string;
  Duration?: number; // in seconds
  Format?: string;
  Grouping?: string;
  Part?: string;
  Part_Position?: string;
  Copyright?: string;
  Cover?: string; // 'Yes' if cover exists
  Cover_Data?: string; // Base64 encoded cover
  Cover_Mime?: string;
  // Custom m4b tags (lowercase)
  nrt?: string; // narrator
  pub?: string; // publisher
  // Audio track fields
  BitRate?: number;
  SamplingRate?: number;
  Channels?: number;
  // Allow other fields
  [key: string]: unknown;
}

/**
 * Normalize year string to just the year portion
 */
function normalizeYear(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;

  // Try to extract a 4-digit year
  const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0], 10);
    if (year >= 1000 && year <= 2100) {
      return yearMatch[0];
    }
  }

  return undefined;
}

/**
 * Map mediainfo.js result to ExtractedMetadata
 */
function mapMediaInfoToMetadata(result: MediaInfoResult): ExtractedMetadata {
  const tracks = (result.media?.track || []) as MediaInfoTrack[];
  const generalTrack = tracks.find((t) => t['@type'] === 'General');
  const audioTrack = tracks.find((t) => t['@type'] === 'Audio');
  const imageTrack = tracks.find((t) => t['@type'] === 'Image');

  if (!generalTrack) {
    return {};
  }

  // Smart fallback for author: Artist → Performer → AlbumPerformer
  const author =
    generalTrack.Artist ||
    generalTrack.Performer ||
    generalTrack.AlbumPerformer ||
    undefined;

  // Smart fallback for narrator: custom nrt tag → Composer (common m4b convention)
  const narrator = generalTrack.nrt || generalTrack.Composer || undefined;

  // Smart fallback for publisher: custom pub tag → Publisher → Label
  const publisher =
    generalTrack.pub ||
    generalTrack.Publisher ||
    generalTrack.Label ||
    undefined;

  // Parse genres - may be comma-separated or semicolon-separated
  let genres: string[] | undefined;
  if (generalTrack.Genre) {
    genres = generalTrack.Genre.split(/[,;]/)
      .map((g) => g.trim())
      .filter(Boolean);
  }

  // Duration comes in seconds from mediainfo.js
  const duration = generalTrack.Duration
    ? Math.round(generalTrack.Duration)
    : undefined;

  // Bitrate from audio track (in bps, convert to kbps)
  const bitrate = audioTrack?.BitRate
    ? Math.round(audioTrack.BitRate / 1000)
    : undefined;

  // Sample rate from audio track
  const sampleRate = audioTrack?.SamplingRate || undefined;

  // Check for embedded cover
  const hasEmbeddedCover = generalTrack.Cover === 'Yes' || !!imageTrack;

  return {
    title: generalTrack.Title || generalTrack.Track || undefined,
    album: generalTrack.Album || undefined,
    subtitle: undefined, // mediainfo.js doesn't have a standard subtitle field
    author,
    narrator,
    description: generalTrack.Description || generalTrack.Comment || undefined,
    publisher,
    publishedDate: normalizeYear(
      generalTrack.Recorded_Date ||
        generalTrack.Released_Date ||
        generalTrack.Original_Released_Date,
    ),
    language: generalTrack.Language || undefined,
    genres,
    series: generalTrack.Grouping || undefined,
    seriesOrder: generalTrack.Part || generalTrack.Part_Position || undefined,
    hasEmbeddedCover,
    duration,
    format: generalTrack.Format || audioTrack?.Format || undefined,
    bitrate,
    sampleRate,
  };
}

/**
 * Extract chapters using ffprobe (mediainfo.js doesn't handle chapters well)
 */
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
  const stats = await fs.stat(filePath);

  // Use mediainfo.js for metadata extraction
  const mediaInfoResult = await analyzeFile(filePath);
  const metadata = mapMediaInfoToMetadata(mediaInfoResult);

  // Build file info
  const fileInfo: AudioFileInfo = {
    filePath,
    fileName: path.basename(filePath),
    duration: metadata.duration || 0,
    format: metadata.format || path.extname(filePath).slice(1).toUpperCase(),
    bitrate: metadata.bitrate,
    sampleRate: metadata.sampleRate,
    sizeBytes: stats.size,
  };

  // Use ffprobe for chapter extraction (mediainfo.js doesn't handle chapters well)
  let chapters: Chapter[] = [];
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (['.m4b', '.m4a', '.mp4', '.mp3', '.ogg', '.flac'].includes(ext)) {
      chapters = await extractChaptersWithFfprobe(filePath);
    }
  } catch {
    // Chapters are optional, don't fail the whole extraction
  }

  return { metadata, fileInfo, chapters };
}

async function getFileInfo(filePath: string): Promise<AudioFileInfo> {
  const stats = await fs.stat(filePath);

  // Use mediainfo.js for file info
  const mediaInfoResult = await analyzeFile(filePath);
  const metadata = mapMediaInfoToMetadata(mediaInfoResult);

  return {
    filePath,
    fileName: path.basename(filePath),
    duration: metadata.duration || 0,
    format: metadata.format || path.extname(filePath).slice(1).toUpperCase(),
    bitrate: metadata.bitrate,
    sampleRate: metadata.sampleRate,
    sizeBytes: stats.size,
  };
}

/**
 * Extract cover using ffmpeg as a fallback when mediainfo.js doesn't provide cover data.
 * This handles m4b/m4a files where covers are stored as attached picture streams.
 */
async function extractCoverWithFfmpeg(
  filePath: string,
): Promise<{ data: number[]; mimeType: string } | null> {
  try {
    // First check if there's an attached picture stream
    const { stdout: probeOutput } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams -select_streams v "${filePath.replace(/"/g, '\\"')}"`,
      { maxBuffer: 10 * 1024 * 1024 },
    );

    const probeData = JSON.parse(probeOutput);
    const attachedPicStream = probeData.streams?.find(
      (s: { disposition?: { attached_pic?: number } }) =>
        s.disposition?.attached_pic === 1,
    );

    if (!attachedPicStream) {
      return null;
    }

    // Extract the cover to a temporary file, then read it
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'cover-'));
    const tempFile = path.join(tempDir, 'cover.jpg');

    try {
      await execAsync(
        `ffmpeg -v quiet -i "${filePath.replace(/"/g, '\\"')}" -an -vcodec copy "${tempFile}"`,
        { maxBuffer: 10 * 1024 * 1024 },
      );

      const coverData = await fs.readFile(tempFile);

      // Detect mime type from magic bytes
      let mimeType = 'image/jpeg';
      if (coverData[0] === 0x89 && coverData[1] === 0x50) {
        mimeType = 'image/png';
      } else if (coverData[0] === 0x47 && coverData[1] === 0x49) {
        mimeType = 'image/gif';
      } else if (
        coverData[0] === 0x52 &&
        coverData[1] === 0x49 &&
        coverData[2] === 0x46 &&
        coverData[3] === 0x46
      ) {
        mimeType = 'image/webp';
      }

      return {
        data: Array.from(coverData),
        mimeType,
      };
    } finally {
      // Clean up temp files
      try {
        await fs.unlink(tempFile);
        await fs.rmdir(tempDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch {
    return null;
  }
}

async function extractCover(
  filePath: string,
): Promise<{ data: number[]; mimeType: string } | null> {
  const mediaInfoResult = await analyzeFile(filePath);
  const tracks = (mediaInfoResult.media?.track || []) as MediaInfoTrack[];
  const generalTrack = tracks.find((t) => t['@type'] === 'General');

  // Check for cover data in general track (base64 encoded by mediainfo.js)
  if (generalTrack?.Cover_Data) {
    const mimeType = generalTrack.Cover_Mime || 'image/jpeg';
    const data = Buffer.from(generalTrack.Cover_Data, 'base64');
    return {
      data: Array.from(data),
      mimeType,
    };
  }

  // Check for image track or Cover indicator (some files embed cover as attached picture stream)
  const imageTrack = tracks.find((t) => t['@type'] === 'Image');
  const hasCoverIndicator = generalTrack?.Cover === 'Yes';

  if (imageTrack || hasCoverIndicator) {
    // mediainfo.js detected a cover but didn't provide the data
    // This happens with m4b/m4a files using attached picture streams
    // Fall back to ffmpeg extraction
    const ffmpegResult = await extractCoverWithFfmpeg(filePath);
    if (ffmpegResult) {
      return ffmpegResult;
    }
  }

  return null;
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
