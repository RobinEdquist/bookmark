import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { BadRequestException } from '@nestjs/common';
import * as unzipper from 'unzipper';

/**
 * Defaults sized to be far above any legitimate archive this server handles
 * while still bounding the damage of a zip bomb: `unzipper` parses the
 * central directory up front, but the declared sizes there are
 * attacker-controlled and can lie, so extraction additionally enforces a
 * budget on actually inflated bytes.
 */
export const DEFAULT_ZIP_MAX_ENTRIES = 100_000;
export const DEFAULT_ZIP_MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024 * 1024;

export interface SafeZipExtractOptions {
  maxEntries?: number;
  maxUncompressedBytes?: number;
}

/**
 * Extracts a zip archive to `destination` safely:
 *
 * - rejects archives with more than `maxEntries` entries,
 * - rejects archives whose *declared* uncompressed size exceeds
 *   `maxUncompressedBytes`,
 * - rejects entries whose paths escape `destination` (`../`, absolute
 *   paths, backslash separators normalized before checking),
 * - enforces `maxUncompressedBytes` against the bytes actually inflated
 *   while streaming (declared sizes can lie),
 * - writes with `flags: 'wx'`, so a duplicate entry name fails instead of
 *   silently overwriting.
 *
 * On failure the destination may contain partially extracted files; the
 * caller owns the destination directory and is responsible for cleaning it
 * up.
 */
export async function extractZipSafely(
  archivePath: string,
  destination: string,
  options: SafeZipExtractOptions = {},
): Promise<void> {
  const maxEntries = options.maxEntries ?? DEFAULT_ZIP_MAX_ENTRIES;
  const maxUncompressedBytes =
    options.maxUncompressedBytes ?? DEFAULT_ZIP_MAX_UNCOMPRESSED_BYTES;

  const directory = await unzipper.Open.file(archivePath);

  if (directory.files.length > maxEntries) {
    throw new BadRequestException('Archive contains too many files');
  }

  const declaredBytes = directory.files.reduce(
    (total, entry) => total + entry.uncompressedSize,
    0,
  );
  if (declaredBytes > maxUncompressedBytes) {
    throw new BadRequestException('Archive is too large to extract safely');
  }

  const normalizedPaths = directory.files.map((entry) =>
    normalizeEntryPath(entry.path),
  );
  for (const normalized of normalizedPaths) {
    if (
      normalized === '' ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      path.posix.isAbsolute(normalized)
    ) {
      throw new BadRequestException('Archive contains an unsafe file path');
    }
  }

  let remainingBytes = maxUncompressedBytes;

  for (let i = 0; i < directory.files.length; i++) {
    const entry = directory.files[i];
    const normalized = normalizedPaths[i];
    const outputPath = path.join(destination, ...normalized.split('/'));

    if (entry.type === 'Directory') {
      await fsPromises.mkdir(outputPath, { recursive: true });
      continue;
    }

    await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    await pipeline(
      entry.stream(),
      new Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          remainingBytes -= chunk.length;
          if (remainingBytes < 0) {
            callback(
              new BadRequestException('Archive is too large to extract safely'),
            );
          } else {
            callback(null, chunk);
          }
        },
      }),
      fs.createWriteStream(outputPath, { flags: 'wx' }),
    );
  }
}

function normalizeEntryPath(entryPath: string): string {
  // Zip entries written on Windows can use backslashes as separators;
  // normalize them first so traversal checks cannot be smuggled past
  // posix.normalize via `..\`.
  return path.posix
    .normalize(entryPath.replace(/\\/g, '/'))
    .replace(/\/+$/, '');
}
