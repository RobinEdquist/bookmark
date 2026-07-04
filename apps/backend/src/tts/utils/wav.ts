// Minimal pure WAV (RIFF/PCM) helpers - enough to concatenate chunks coming
// back from the TTS server and measure their durations without ffprobe.

export interface WavInfo {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  bitsPerSample: number;
  /** Byte offset of the PCM payload within the buffer. */
  dataOffset: number;
  /** Byte length of the PCM payload. */
  dataLength: number;
}

/**
 * Parse a RIFF/WAVE buffer by walking its chunks (headers are not always
 * exactly 44 bytes - some encoders insert LIST/fact chunks).
 */
export function parseWav(buffer: Buffer): WavInfo {
  if (
    buffer.length < 12 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('Not a RIFF/WAVE buffer');
  }

  let offset = 12;
  let fmt: Omit<WavInfo, 'dataOffset' | 'dataLength'> | null = null;
  let dataOffset = -1;
  let dataLength = -1;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const declaredSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ') {
      if (chunkStart + 16 > buffer.length) {
        throw new Error('Truncated fmt chunk');
      }
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkStart;
      // Streaming encoders sometimes write 0 or 0xFFFFFFFF as a placeholder
      // size - fall back to "rest of the buffer" when the size is bogus.
      const remaining = buffer.length - chunkStart;
      dataLength =
        declaredSize === 0 || declaredSize > remaining
          ? remaining
          : declaredSize;
      break; // audio payload is the last chunk we care about
    }

    // Chunks are word-aligned
    const advance =
      declaredSize === 0xffffffff || chunkStart + declaredSize > buffer.length
        ? buffer.length // bail out of the loop
        : chunkStart + declaredSize + (declaredSize % 2);
    offset = advance;
  }

  if (!fmt) throw new Error('WAV buffer has no fmt chunk');
  if (dataOffset < 0) throw new Error('WAV buffer has no data chunk');

  return { ...fmt, dataOffset, dataLength };
}

export function wavDurationMs(buffer: Buffer): number {
  const info = parseWav(buffer);
  if (info.byteRate <= 0) return 0;
  return Math.round((info.dataLength / info.byteRate) * 1000);
}

function writeWavHeader(
  fmt: Pick<
    WavInfo,
    'audioFormat' | 'channels' | 'sampleRate' | 'byteRate' | 'bitsPerSample'
  >,
  dataLength: number,
): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(fmt.audioFormat, 20);
  header.writeUInt16LE(fmt.channels, 22);
  header.writeUInt32LE(fmt.sampleRate, 24);
  header.writeUInt32LE(fmt.byteRate, 28);
  header.writeUInt16LE((fmt.channels * fmt.bitsPerSample) / 8, 32);
  header.writeUInt16LE(fmt.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/**
 * Concatenate WAV buffers with identical formats into one WAV buffer with a
 * canonical 44-byte header.
 */
export function concatWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error('No WAV buffers to concatenate');
  }

  const infos = buffers.map(parseWav);
  const first = infos[0];
  for (const info of infos) {
    if (
      info.audioFormat !== first.audioFormat ||
      info.channels !== first.channels ||
      info.sampleRate !== first.sampleRate ||
      info.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error('Cannot concatenate WAV buffers with differing formats');
    }
  }

  const payloads = buffers.map((buffer, i) =>
    buffer.subarray(
      infos[i].dataOffset,
      infos[i].dataOffset + infos[i].dataLength,
    ),
  );
  const totalLength = payloads.reduce((sum, p) => sum + p.length, 0);

  return Buffer.concat([writeWavHeader(first, totalLength), ...payloads]);
}
