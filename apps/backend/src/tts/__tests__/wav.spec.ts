import { parseWav, wavDurationMs, concatWavBuffers } from '../utils/wav';

/** Build a minimal PCM wav buffer: 24 kHz mono 16-bit. */
function makeWav(samples: number[], sampleRate = 24000): Buffer {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byteRate
  buffer.writeUInt16LE(2, 32); // blockAlign
  buffer.writeUInt16LE(16, 34); // bits
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataLength, 40);
  samples.forEach((s, i) => buffer.writeInt16LE(s, 44 + i * 2));
  return buffer;
}

describe('parseWav', () => {
  it('parses format and data payload location', () => {
    const wav = makeWav([1, 2, 3]);
    const info = parseWav(wav);
    expect(info.sampleRate).toBe(24000);
    expect(info.channels).toBe(1);
    expect(info.bitsPerSample).toBe(16);
    expect(info.dataOffset).toBe(44);
    expect(info.dataLength).toBe(6);
  });

  it('rejects non-wav buffers', () => {
    expect(() => parseWav(Buffer.from('not a wav file at all'))).toThrow(
      'Not a RIFF/WAVE buffer',
    );
  });

  it('falls back to remaining bytes when data size is a bogus placeholder', () => {
    const wav = makeWav([1, 2, 3, 4]);
    wav.writeUInt32LE(0, 40); // streaming encoders sometimes write 0
    expect(parseWav(wav).dataLength).toBe(8);
  });
});

describe('wavDurationMs', () => {
  it('computes duration from byte rate', () => {
    // 24000 samples of 16-bit mono at 24 kHz = exactly 1 second
    const wav = makeWav(Array(24000).fill(0));
    expect(wavDurationMs(wav)).toBe(1000);
  });
});

describe('concatWavBuffers', () => {
  it('concatenates payloads and rewrites the header', () => {
    const a = makeWav([1, 2]);
    const b = makeWav([3, 4, 5]);
    const combined = concatWavBuffers([a, b]);

    const info = parseWav(combined);
    expect(info.dataLength).toBe(10);
    expect(combined.readInt16LE(info.dataOffset)).toBe(1);
    expect(combined.readInt16LE(info.dataOffset + 4)).toBe(3);
    expect(combined.readInt16LE(info.dataOffset + 8)).toBe(5);
  });

  it('rejects mismatched formats', () => {
    const a = makeWav([1], 24000);
    const b = makeWav([2], 44100);
    expect(() => concatWavBuffers([a, b])).toThrow('differing formats');
  });

  it('rejects an empty list', () => {
    expect(() => concatWavBuffers([])).toThrow('No WAV buffers');
  });
});
