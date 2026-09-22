import { EbookMetadataProvider } from './ebook-metadata.provider';

describe('EbookMetadataProvider', () => {
  function buildProvider(executeTask: jest.Mock) {
    const workerPool = {
      initializePool: jest.fn(),
      executeTask,
    };
    return new EbookMetadataProvider(workerPool as any);
  }

  it('rethrows PDF metadata failures instead of filename fallback', async () => {
    const executeTask = jest
      .fn()
      .mockRejectedValue(new Error('PDF requires a password and cannot be imported'));
    const provider = buildProvider(executeTask);

    await expect(
      provider.extractMetadata('/library/ebooks/Secret.pdf'),
    ).rejects.toThrow(/password/i);
  });

  it('falls back to filename for EPUB metadata failures', async () => {
    const executeTask = jest
      .fn()
      .mockRejectedValue(new Error('epub parse failed'));
    const provider = buildProvider(executeTask);

    const result = await provider.extractMetadata('/library/ebooks/Broken.epub');
    expect(result).toEqual({ title: 'Broken', authors: [] });
  });

  it('returns PDF cover MIME type image/png from worker result', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const executeTask = jest.fn().mockResolvedValue({
      data: png,
      mimeType: 'image/png',
    });
    const provider = buildProvider(executeTask);

    const result = await provider.extractCoverFromFile('/library/ebooks/Book.pdf');
    expect(result?.mimeType).toBe('image/png');
    expect(Buffer.isBuffer(result?.data)).toBe(true);
  });
});
