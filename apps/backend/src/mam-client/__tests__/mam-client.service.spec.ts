import { HttpException } from '@nestjs/common';
import { MamClientService } from '../mam-client.service';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function createMockConfigService(
  overrides: Record<string, string | undefined> = {},
) {
  const config: Record<string, string | undefined> = {
    MAM_CLIENT_URL: 'http://mam:3000',
    MAM_CLIENT_API_KEY: 'test-key',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => config[key]),
  };
}

function mockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(headers),
    body: null,
  } as unknown as Response;
}

function mockStreamResponse(
  chunks: Uint8Array[],
  status = 200,
  headers: Record<string, string> = {},
): Response {
  let index = 0;
  const reader = {
    read: jest.fn(async () => {
      if (index < chunks.length) {
        return { done: false, value: chunks[index++] };
      }
      return { done: true, value: undefined };
    }),
    releaseLock: jest.fn(),
  };

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: new Headers(headers),
    body: { getReader: () => reader },
  } as unknown as Response;
}

function createMockRes() {
  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    end: jest.fn(),
    write: jest.fn(),
  };
}

describe('MamClientService', () => {
  let service: MamClientService;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockConfig = createMockConfigService();
    service = new MamClientService(mockConfig as any);
  });

  // ===== isConfigured =====

  describe('isConfigured', () => {
    it('should return true when both URL and API key are set', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when URL is missing', () => {
      const config = createMockConfigService({ MAM_CLIENT_URL: undefined });
      const svc = new MamClientService(config as any);
      expect(svc.isConfigured()).toBe(false);
    });

    it('should return false when API key is missing', () => {
      const config = createMockConfigService({
        MAM_CLIENT_API_KEY: undefined,
      });
      const svc = new MamClientService(config as any);
      expect(svc.isConfigured()).toBe(false);
    });
  });

  // ===== request (via public methods) =====

  describe('request', () => {
    it('should throw 503 when not configured', async () => {
      const config = createMockConfigService({ MAM_CLIENT_URL: undefined });
      const svc = new MamClientService(config as any);

      await expect(svc.search({ query: 'test' } as any)).rejects.toThrow(
        HttpException,
      );
      await expect(svc.search({ query: 'test' } as any)).rejects.toThrow(
        'MAM client not configured',
      );
    });

    it('should throw HttpException on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 400));

      await expect(svc_getTorrentStatus('abc123')).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw 503 on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      try {
        await service.getTorrentStatus('abc123');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(503);
      }
    });
  });

  // ===== search =====

  describe('search', () => {
    it('should default main_cat to [13, 14]', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ results: [] }));

      await service.search({ query: 'audiobooks' } as any);

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(calledBody.tor.main_cat).toEqual([13, 14]);
      expect(calledBody.description).toBe(true);
    });

    it('should pass custom main_cat when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ results: [] }));

      await service.search({ query: 'test', main_cat: [13] } as any);

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(calledBody.tor.main_cat).toEqual([13]);
    });
  });

  // ===== download =====

  describe('download', () => {
    it('should call correct endpoint with torrent ID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await service.download('12345');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://mam:3000/download/12345',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  // ===== getTorrentStatus =====

  describe('getTorrentStatus', () => {
    it('should call GET with hash', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ hash: 'abc', status: 'done' }),
      );

      await service.getTorrentStatus('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://mam:3000/torrent/abc123',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  // ===== getBulkTorrentStatus =====

  describe('getBulkTorrentStatus', () => {
    it('should join hashes with comma', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}));

      await service.getBulkTorrentStatus(['hash1', 'hash2', 'hash3']);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://mam:3000/torrents?hashes=hash1,hash2,hash3',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  // ===== proxyImage =====

  describe('proxyImage', () => {
    it('should throw 503 when not configured', async () => {
      const config = createMockConfigService({ MAM_CLIENT_URL: undefined });
      const svc = new MamClientService(config as any);
      const res = createMockRes();

      await expect(svc.proxyImage('123', res as any)).rejects.toThrow(
        HttpException,
      );
    });

    it('should forward response headers from upstream', async () => {
      const upstream = mockStreamResponse([new Uint8Array([1, 2, 3])], 200, {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=3600',
        etag: '"abc123"',
      });
      mockFetch.mockResolvedValueOnce(upstream);
      const res = createMockRes();

      await service.proxyImage('123', res as any);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=3600',
      );
      expect(res.setHeader).toHaveBeenCalledWith('ETag', '"abc123"');
      expect(res.write).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
      expect(res.end).toHaveBeenCalled();
    });

    it('should set default cache-control when none from upstream', async () => {
      const upstream = mockStreamResponse([new Uint8Array([1])], 200, {
        'content-type': 'image/png',
      });
      mockFetch.mockResolvedValueOnce(upstream);
      const res = createMockRes();

      await service.proxyImage('123', res as any);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=31536000, immutable',
      );
    });

    it('should handle empty body with 204', async () => {
      const upstream = mockResponse(null, 200, {
        'content-type': 'image/jpeg',
      });
      // body is null by default in mockResponse
      mockFetch.mockResolvedValueOnce(upstream);
      const res = createMockRes();

      await service.proxyImage('123', res as any);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should throw HttpException when upstream returns error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 404));
      const res = createMockRes();

      await expect(service.proxyImage('123', res as any)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw 502 on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      const res = createMockRes();

      try {
        await service.proxyImage('123', res as any);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(502);
      }
    });
  });

  // ===== healthCheck =====

  describe('healthCheck', () => {
    it('should return true when health endpoint responds OK', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://mam:3000/health');
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });
});

function svc_getTorrentStatus(hash: string) {
  const config = createMockConfigService();
  const svc = new MamClientService(config as any);
  return svc.getTorrentStatus(hash);
}
