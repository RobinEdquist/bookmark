import {
  bytesToBuffer,
  copyToTransferableBytes,
  transferListFor,
} from '../utils/worker-bytes.util';

describe('worker byte utilities', () => {
  it('creates a standalone transferable copy without detaching the source', () => {
    const source = Buffer.from([1, 2, 3]);
    const transferable = copyToTransferableBytes(source);

    expect(Array.from(transferable)).toEqual([1, 2, 3]);
    expect(transferable.buffer).not.toBe(source.buffer);
    expect(Array.from(source)).toEqual([1, 2, 3]);
    expect(transferListFor(transferable)).toEqual([transferable.buffer]);
  });

  it('wraps received bytes in a zero-copy Buffer view', () => {
    const bytes = Uint8Array.from([10, 20, 30]);
    const buffer = bytesToBuffer(bytes);

    bytes[1] = 99;
    expect(Array.from(buffer)).toEqual([10, 99, 30]);
  });
});
