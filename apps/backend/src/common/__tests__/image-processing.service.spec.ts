import { ImageProcessingService } from '../image-processing.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWorkerPool(overrides: Record<string, jest.Mock> = {}) {
  return {
    initializePool: jest.fn().mockResolvedValue(undefined),
    executeTask: jest.fn().mockResolvedValue({
      data: Uint8Array.from([1, 2, 3]),
      mimeType: 'image/jpeg',
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImageProcessingService', () => {
  let service: ImageProcessingService;
  let mockWorkerPool: ReturnType<typeof createMockWorkerPool>;

  beforeEach(() => {
    mockWorkerPool = createMockWorkerPool();
    service = new ImageProcessingService(mockWorkerPool as any);
  });

  // -----------------------------------------------------------------------
  // onModuleInit
  // -----------------------------------------------------------------------
  describe('onModuleInit', () => {
    it('initializes worker pool with correct configuration', async () => {
      await service.onModuleInit();

      expect(mockWorkerPool.initializePool).toHaveBeenCalledWith({
        name: 'image-processing',
        workerScript: expect.stringContaining('image.worker.js'),
        minWorkers: 2,
        maxWorkers: 4,
      });
    });
  });

  // -----------------------------------------------------------------------
  // processImage
  // -----------------------------------------------------------------------
  describe('processImage', () => {
    it('calls workerPool.executeTask with correct arguments', async () => {
      const buffer = Buffer.from([10, 20, 30]);

      await service.processImage(buffer, {
        maxWidth: 500,
        maxHeight: 500,
        quality: 90,
        format: 'png',
      });

      expect(mockWorkerPool.executeTask).toHaveBeenCalledWith(
        'image-processing',
        'processImage',
        {
          imageData: Uint8Array.from([10, 20, 30]),
          options: {
            maxWidth: 500,
            maxHeight: 500,
            quality: 90,
            format: 'png',
          },
        },
        [expect.any(ArrayBuffer)],
      );
    });

    it('wraps transferred bytes as a Buffer', async () => {
      mockWorkerPool.executeTask.mockResolvedValue({
        data: Uint8Array.from([65, 66, 67]),
        mimeType: 'image/jpeg',
      });

      const result = await service.processImage(Buffer.from([1]));

      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(Array.from(result.data)).toEqual([65, 66, 67]);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('uses default options when none provided', async () => {
      const buffer = Buffer.from([1, 2]);

      await service.processImage(buffer);

      expect(mockWorkerPool.executeTask).toHaveBeenCalledWith(
        'image-processing',
        'processImage',
        {
          imageData: Uint8Array.from([1, 2]),
          options: {
            maxWidth: 1000,
            maxHeight: 1000,
            quality: 85,
            format: 'jpeg',
          },
        },
        [expect.any(ArrayBuffer)],
      );
    });

    it('passes custom options when provided', async () => {
      const buffer = Buffer.from([1]);

      await service.processImage(buffer, {
        maxWidth: 200,
        maxHeight: 300,
        quality: 70,
        format: 'webp',
      });

      expect(mockWorkerPool.executeTask).toHaveBeenCalledWith(
        'image-processing',
        'processImage',
        {
          imageData: Uint8Array.from([1]),
          options: {
            maxWidth: 200,
            maxHeight: 300,
            quality: 70,
            format: 'webp',
          },
        },
        [expect.any(ArrayBuffer)],
      );
    });
  });

  // -----------------------------------------------------------------------
  // processCover
  // -----------------------------------------------------------------------
  describe('processCover', () => {
    it('delegates to processImage with standard cover settings', async () => {
      mockWorkerPool.executeTask.mockResolvedValue({
        data: Uint8Array.from([99, 100]),
        mimeType: 'image/jpeg',
      });

      const buffer = Buffer.from([5, 6, 7]);
      const result = await service.processCover(buffer);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(Array.from(result)).toEqual([99, 100]);

      expect(mockWorkerPool.executeTask).toHaveBeenCalledWith(
        'image-processing',
        'processImage',
        {
          imageData: Uint8Array.from([5, 6, 7]),
          options: {
            maxWidth: 1000,
            maxHeight: 1000,
            quality: 85,
            format: 'jpeg',
          },
        },
        [expect.any(ArrayBuffer)],
      );
    });
  });
});
