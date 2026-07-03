import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { buildFfmetadata, FfChapter } from './utils/ffmetadata';

export interface M4bAssemblyInput {
  /** Working directory containing the chapter wav files. */
  workDir: string;
  /** Chapter wav filenames (relative to workDir), in playback order. */
  wavFileNames: string[];
  /** Global metadata tags (title, artist, composer=narrator, ...). */
  tags: Record<string, string | undefined>;
  /** Chapter markers matching the wav files. */
  chapters: FfChapter[];
  /** Optional cover image filename (relative to workDir). */
  coverFileName?: string;
  /** Output filename (relative to workDir). */
  outputFileName: string;
}

const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Concatenates per-chapter wav files into a single .m4b (mp4 container)
 * with AAC audio, chapter markers, metadata tags, and an embedded cover.
 */
@Injectable()
export class M4bAssemblerService {
  private readonly logger = new Logger(M4bAssemblerService.name);

  async assemble(input: M4bAssemblyInput): Promise<string> {
    const concatPath = path.join(input.workDir, 'concat.txt');
    const metadataPath = path.join(input.workDir, 'ffmetadata.txt');
    const outputPath = path.join(input.workDir, input.outputFileName);

    // Filenames are zero-padded names we generated ourselves, so no
    // concat-file escaping concerns.
    const concatContent = input.wavFileNames
      .map((name) => `file '${name}'`)
      .join('\n');
    await fs.writeFile(concatPath, concatContent, 'utf-8');
    await fs.writeFile(
      metadataPath,
      buildFfmetadata(input.tags, input.chapters),
      'utf-8',
    );

    const args = [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'concat.txt',
      '-i',
      'ffmetadata.txt',
      ...(input.coverFileName ? ['-i', input.coverFileName] : []),
      '-map',
      '0:a',
      ...(input.coverFileName ? ['-map', '2:v'] : []),
      '-map_metadata',
      '1',
      '-map_chapters',
      '1',
      '-c:a',
      'aac',
      '-b:a',
      '64k',
      '-ac',
      '1',
      '-ar',
      '24000',
      ...(input.coverFileName
        ? ['-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic']
        : []),
      '-movflags',
      '+faststart',
      // ffmpeg doesn't infer the mp4 muxer from the .m4b extension
      '-f',
      'mp4',
      input.outputFileName,
    ];

    this.logger.debug(`Running ffmpeg ${args.join(' ')} in ${input.workDir}`);
    await this.runFfmpeg(args, input.workDir);
    return outputPath;
  }

  private runFfmpeg(args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args, {
        cwd,
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        // Keep only the tail - that's where ffmpeg puts the actual error
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
      });

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('ffmpeg timed out assembling the audiobook'));
      }, FFMPEG_TIMEOUT_MS);

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Failed to start ffmpeg (is it installed?): ${error.message}`,
          ),
        );
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `ffmpeg exited with code ${code}: ${stderr.split('\n').slice(-5).join(' ').trim()}`,
            ),
          );
        }
      });
    });
  }
}
