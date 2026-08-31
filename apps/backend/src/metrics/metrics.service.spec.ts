import { EventEmitter } from 'node:events';
import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { StatsService } from '../stats/stats.service';
import { MetricsService } from './metrics.service';

const configStub = (values: Record<string, string> = {}) =>
  ({
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  }) as ConfigService;

const statsStub = (impl?: () => Promise<unknown>) =>
  ({
    getStats:
      impl ??
      jest.fn().mockResolvedValue({
        audiobooks: 12,
        ebooks: 34,
        comics: 56,
        pendingRequests: 2,
        requestsToday: 3,
        finishedRequests: 40,
        totalListeningTimeSeconds: 9876,
      }),
  }) as unknown as StatsService;

/** Runs the middleware over a fake request/response and completes it. */
const simulateRequest = (
  service: MetricsService,
  routePath: string | undefined,
  statusCode = 200,
) => {
  const req = {
    method: 'GET',
    baseUrl: '',
    route: routePath ? { path: routePath } : undefined,
  } as unknown as Request;
  const res = new EventEmitter() as unknown as Response & EventEmitter;
  (res as { statusCode: number }).statusCode = statusCode;
  const next: NextFunction = jest.fn();

  service.middleware()(req, res, next);
  res.emit('finish');
  return next;
};

describe('MetricsService', () => {
  it('is disabled by default: no metrics registered, middleware passes through', async () => {
    const service = new MetricsService(configStub(), statsStub());

    expect(service.enabled).toBe(false);
    const next = simulateRequest(service, '/api/health');
    expect(next).toHaveBeenCalled();
    expect((await service.registry.metrics()).trim()).toBe('');
  });

  describe('when METRICS_ENABLED=true', () => {
    const enabledService = (stats = statsStub()) =>
      new MetricsService(configStub({ METRICS_ENABLED: 'true' }), stats);

    it('records HTTP durations labeled by route pattern', async () => {
      const service = enabledService();

      simulateRequest(service, '/api/health');
      simulateRequest(service, undefined, 404);

      const text = await service.registry.metrics();
      expect(text).toContain(
        'http_request_duration_seconds_count{method="GET",route="/api/health",status_code="200"} 1',
      );
      expect(text).toContain(
        'http_request_duration_seconds_count{method="GET",route="unmatched",status_code="404"} 1',
      );
    });

    it('collects default process metrics', async () => {
      const text = await enabledService().registry.metrics();
      expect(text).toContain('process_cpu_user_seconds_total');
    });

    it('exposes domain gauges fed by StatsService', async () => {
      const text = await enabledService().registry.metrics();

      expect(text).toContain('bookmark_library_items{type="audiobooks"} 12');
      expect(text).toContain('bookmark_library_items{type="ebooks"} 34');
      expect(text).toContain('bookmark_library_items{type="comics"} 56');
      expect(text).toContain('bookmark_requests{status="pending"} 2');
      expect(text).toContain('bookmark_requests{status="complete"} 40');
      expect(text).toContain('bookmark_requests_created_today 3');
      expect(text).toContain('bookmark_listening_time_seconds 9876');
    });

    it('caches stats between scrapes', async () => {
      const stats = statsStub();
      const service = enabledService(stats);

      await service.registry.metrics();
      await service.registry.metrics();

      expect(stats.getStats).toHaveBeenCalledTimes(1);
    });

    it('survives a failing stats refresh', async () => {
      const service = enabledService(
        statsStub(() => Promise.reject(new Error('db down'))),
      );

      await expect(service.registry.metrics()).resolves.toContain(
        '# HELP bookmark_library_items',
      );
    });
  });

  describe('metrics HTTP endpoint', () => {
    /** Boots the metrics server on an ephemeral port and returns its base URL. */
    async function startService(
      config: Record<string, string> = {},
    ): Promise<{ service: MetricsService; baseUrl: string }> {
      const service = new MetricsService(
        configStub({ METRICS_ENABLED: 'true', METRICS_PORT: '0', ...config }),
        statsStub(),
      );
      service.onApplicationBootstrap();
      const server = (
        service as unknown as { server: import('node:http').Server }
      ).server!;
      // address() is only valid once the 'listening' event has fired.
      await new Promise<void>((resolve) => {
        if (server.listening) {
          resolve();
        } else {
          server.once('listening', () => resolve());
        }
      });
      // Port 0 → OS-assigned; read it back from the underlying server.
      const address = server.address() as {
        port: number;
        address: string;
      };
      // The default bind is all-interfaces ('::'), which is not a fetchable
      // host on its own.
      const host =
        address.address === '::' || address.address === '0.0.0.0'
          ? '127.0.0.1'
          : address.address;
      return {
        service,
        baseUrl: `http://${host}:${address.port}`,
      };
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    async function stopService(service: MetricsService): Promise<void> {
      await new Promise<void>((resolve) => {
        const server = (
          service as unknown as { server: { close(cb: () => void): void } }
        ).server;
        if (server) {
          server.close(() => resolve());
        } else {
          resolve();
        }
      });
    }

    it('serves metrics without a token when METRICS_TOKEN is unset', async () => {
      const { service, baseUrl } = await startService();
      try {
        const response = await fetch(`${baseUrl}/metrics`);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain(
          'bookmark_library_items{type="audiobooks"} 12',
        );
      } finally {
        await stopService(service);
      }
    });

    it('binds to the configured interface when METRICS_HOST is set', async () => {
      const { service, baseUrl } = await startService({
        METRICS_HOST: '127.0.0.1',
      });
      try {
        const response = await fetch(`${baseUrl}/metrics`);
        expect(response.status).toBe(200);
      } finally {
        await stopService(service);
      }
    });

    it('rejects scrapes without a bearer token when METRICS_TOKEN is set', async () => {
      const { service, baseUrl } = await startService({
        METRICS_TOKEN: 's3cret',
      });
      try {
        const response = await fetch(`${baseUrl}/metrics`);
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toContain('Bearer');
      } finally {
        await stopService(service);
      }
    });

    it('rejects a wrong bearer token', async () => {
      const { service, baseUrl } = await startService({
        METRICS_TOKEN: 's3cret',
      });
      try {
        const response = await fetch(`${baseUrl}/metrics`, {
          headers: { Authorization: 'Bearer wrong' },
        });
        expect(response.status).toBe(401);
      } finally {
        await stopService(service);
      }
    });

    it('accepts the correct bearer token', async () => {
      const { service, baseUrl } = await startService({
        METRICS_TOKEN: 's3cret',
      });
      try {
        const response = await fetch(`${baseUrl}/metrics`, {
          headers: { Authorization: 'Bearer s3cret' },
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('bookmark_requests');
      } finally {
        await stopService(service);
      }
    });

    it('answers 404 for non-metrics paths', async () => {
      const { service, baseUrl } = await startService();
      try {
        const response = await fetch(`${baseUrl}/`);
        expect(response.status).toBe(404);
      } finally {
        await stopService(service);
      }
    });
  });
});
