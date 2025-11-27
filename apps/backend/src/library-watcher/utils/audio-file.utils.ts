// apps/backend/src/library-watcher/utils/audio-file.utils.ts
import * as path from 'path';

export const AUDIO_EXTENSIONS = [
  '.m4b',
  '.mp3',
  '.m4a',
  '.ogg',
  '.opus',
  '.flac',
  '.aac',
] as const;

export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

export function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext as AudioExtension);
}

export function getAudioFormat(filename: string): string {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return ext;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${secs}s`;
}
