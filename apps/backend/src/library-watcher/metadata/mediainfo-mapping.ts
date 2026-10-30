// Pure mapping from a mediainfo.js result to the values the importer stores.
// Kept free of worker_threads so the worker stays thin and this can be unit
// tested with plain track fixtures.
import type { MediaInfoResult } from 'mediainfo.js';

export interface ExtractedMetadata {
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
  /** Container format from the General track ("MPEG-4", "MPEG Audio", "Ogg") */
  format?: string;
  /** Audio codec from the Audio track ("AAC LC", "MP3", "E-AC-3", "Opus") */
  codec?: string;
  /** Average bitrate in bits per second */
  bitrate?: number;
  /** Sample rate in Hz */
  sampleRate?: number;
}

// Type definitions for mediainfo.js result structure
export interface MediaInfoTrack {
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
  Format_Profile?: string;
  Format_AdditionalFeatures?: string;
  OverallBitRate?: number; // bits per second, whole container
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
  BitRate?: number; // bits per second
  SamplingRate?: number; // Hz
  Channels?: number;
  // Allow other fields
  [key: string]: unknown;
}

/**
 * Normalize year string to just the year portion
 */
export function normalizeYear(dateStr: string | undefined): string | undefined {
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
 * Short codec name for an audio stream. mediainfo puts the codec family in
 * `Format` and the variant in `Format_Profile` / `Format_AdditionalFeatures`
 * ("AAC" + "LC", "MPEG Audio" + "Layer 3"), so join them the way its own
 * `Format/String` output does.
 */
export function describeCodec(
  audioTrack: MediaInfoTrack | undefined,
): string | undefined {
  const format = audioTrack?.Format?.trim();
  if (!audioTrack || !format) return undefined;

  if (format === 'MPEG Audio') {
    const layer = audioTrack.Format_Profile?.match(/Layer\s*(\d)/i)?.[1];
    return layer ? `MP${layer}` : format;
  }

  const features = audioTrack.Format_AdditionalFeatures?.trim();
  return features ? `${format} ${features}` : format;
}

/**
 * Map mediainfo.js result to ExtractedMetadata
 */
export function mapMediaInfoToMetadata(
  result: MediaInfoResult,
): ExtractedMetadata {
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

  // Bitrate stays in bits per second (the API contract). mediainfo omits the
  // per-stream value for some codecs (Opus), so fall back to the container's
  // overall rate, which for a single-stream audiobook is the same number.
  const rawBitrate = audioTrack?.BitRate || generalTrack.OverallBitRate;
  const bitrate = rawBitrate ? Math.round(rawBitrate) : undefined;

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
    // The General track's Format is the container; the codec lives on the
    // Audio track and is exposed separately so the two are never confused.
    format: generalTrack.Format || audioTrack?.Format || undefined,
    codec: describeCodec(audioTrack),
    bitrate,
    sampleRate,
  };
}
