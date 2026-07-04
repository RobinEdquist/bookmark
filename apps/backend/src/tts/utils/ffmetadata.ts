// Pure builder for ffmpeg FFMETADATA1 files (global tags + chapter markers).
// See https://ffmpeg.org/ffmpeg-formats.html#Metadata-1

export interface FfChapter {
  title: string;
  startMs: number;
  endMs: number;
}

/** '=', ';', '#', '\' and newline must be backslash-escaped in values. */
export function escapeFfmetadataValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/=/g, '\\=')
    .replace(/;/g, '\\;')
    .replace(/#/g, '\\#')
    .replace(/\r?\n/g, '\\\n');
}

/**
 * Build the contents of an FFMETADATA1 file. Undefined/empty tag values are
 * omitted. Chapter times are in milliseconds (TIMEBASE=1/1000).
 */
export function buildFfmetadata(
  tags: Record<string, string | undefined>,
  chapters: FfChapter[],
): string {
  const lines: string[] = [';FFMETADATA1'];

  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || value === '') continue;
    lines.push(`${key}=${escapeFfmetadataValue(value)}`);
  }

  for (const chapter of chapters) {
    lines.push('');
    lines.push('[CHAPTER]');
    lines.push('TIMEBASE=1/1000');
    lines.push(`START=${Math.max(0, Math.round(chapter.startMs))}`);
    lines.push(`END=${Math.max(0, Math.round(chapter.endMs))}`);
    lines.push(`title=${escapeFfmetadataValue(chapter.title)}`);
  }

  return lines.join('\n') + '\n';
}
