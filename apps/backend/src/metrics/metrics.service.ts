import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';
import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import { StatsService } from '../stats/stats.service';

/**
 * Metrics endpoint (Prometheus exposition format), fully opt-in: unless
 * METRICS_ENABLED=true nothing is registered, the HTTP middleware is a
 * no-op, and no extra port is opened — deployments without a monitoring
 * stack are unaffected.
 *
 * When enabled, metrics are served on a SEPARATE HTTP port (METRICS_PORT,
 * default 9464) instead of the API port, so they are only reachable from
 * networks that can hit the container directly (e.g. a Docker network shared
 * with a scraper) and never through the public reverse proxy.
 *
 * Hardening knobs (both optional):
 * - METRICS_TOKEN: require `Authorization: Bearer <token>` on scrapes.
 * - METRICS_HOST: interface to bind (e.g. 127.0.0.1). Default binds all
 *   interfaces for backward compatibility with cross-container scraping.
 */
@Injectable()
export class MetricsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  /** Domain gauges refresh at most this often, however hard Prometheus scrapes. */
  private static readonly STATS_TTL_MS = 60_000;

  private readonly logger = new Logger(MetricsService.name);
  readonly registry = new Registry();
  readonly enabled: boolean;
  private readonly port: number;
  private readonly host?: string;
  private readonly token?: string;

  private readonly httpDuration: Histogram;
  private readonly libraryItems: Gauge;
  private readonly requestsByStatus: Gauge;
  private readonly requestsToday: Gauge;
  private readonly listeningSeconds: Gauge;

  private server?: http.Server;
  private lastRefresh = 0;
  private refreshPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    private readonly statsService: StatsService,
  ) {
    this.enabled = this.config.get('METRICS_ENABLED') === 'true';
    this.port = Number(this.config.get('METRICS_PORT', '9464'));
    this.host = this.config.get('METRICS_HOST') || undefined;
    this.token = this.config.get('METRICS_TOKEN') || undefined;

    // When disabled, metrics attach to no registry: they can still be
    // written to (keeping callers branch-free) but are never collected.
    const registers = this.enabled ? [this.registry] : [];
    if (this.enabled) {
      collectDefaultMetrics({ register: this.registry });
    }

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration by method, route pattern and status code',
      labelNames: ['method', 'route', 'status_code'],
      registers,
    });

    const collect = (): Promise<void> => this.refreshDomainMetrics();
    this.libraryItems = new Gauge({
      name: 'bookmark_library_items',
      help: 'Visible library items by content type',
      labelNames: ['type'],
      registers,
      collect,
    });
    this.requestsByStatus = new Gauge({
      name: 'bookmark_requests',
      help: 'Content requests by status',
      labelNames: ['status'],
      registers,
      collect,
    });
    this.requestsToday = new Gauge({
      name: 'bookmark_requests_created_today',
      help: 'Content requests created since UTC midnight',
      registers,
      collect,
    });
    this.listeningSeconds = new Gauge({
      name: 'bookmark_listening_time_seconds',
      help: 'Total recorded listening time across all users',
      registers,
      collect,
    });
  }

  /**
   * Express middleware recording request durations, registered in main.ts
   * ahead of the routers. A pass-through no-op when metrics are disabled.
   */
  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    if (!this.enabled) {
      return (_req, _res, next) => next();
    }
    return (req, res, next) => {
      const stop = this.httpDuration.startTimer();
      res.on('finish', () => {
        // Label by route PATTERN (e.g. /api/audiobooks/:id), never the raw
        // URL, to keep metric cardinality bounded; requests that matched no
        // route (404s, static assets) share a single "unmatched" label.
        const route = req.route
          ? `${req.baseUrl ?? ''}${(req.route as { path: string }).path}`
          : 'unmatched';
        stop({
          method: req.method,
          route,
          status_code: String(res.statusCode),
        });
      });
      next();
    };
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      return;
    }
    this.server = http.createServer((req, res) => {
      void this.serve(req, res);
    });
    this.server.listen(this.port, this.host, () => {
      const bound = this.host ?? 'all interfaces';
      this.logger.log(
        `Prometheus metrics exposed on ${bound}:${this.port}/metrics` +
          (this.token ? ' (bearer token required)' : ''),
      );
    });
  }

  onApplicationShutdown(): void {
    this.server?.close();
  }

  private async serve(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (req.method === 'GET' && req.url?.split('?')[0] === '/metrics') {
      if (!this.isAuthorized(req)) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Bearer realm="bookmark-metrics"');
        res.end('Unauthorized');
        return;
      }
      try {
        const body = await this.registry.metrics();
        res.setHeader('Content-Type', this.registry.contentType);
        res.end(body);
      } catch (error) {
        this.logger.warn(`Metrics collection failed: ${String(error)}`);
        res.statusCode = 500;
        res.end('metrics collection failed');
      }
      return;
    }
    res.statusCode = 404;
    res.end('Not Found');
  }

  /**
   * Scrape authorization. Open by default (the port is container-network
   * internal and never proxied); when METRICS_TOKEN is set, requests must
   * present it as a Bearer token. Compared via SHA-256 digests so the check
   * is timing-safe without leaking token length.
   */
  private isAuthorized(req: http.IncomingMessage): boolean {
    if (!this.token) {
      return true;
    }
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return false;
    }
    const digest = (value: string): Buffer =>
      createHash('sha256').update(value, 'utf8').digest();
    return timingSafeEqual(digest(header.slice(7).trim()), digest(this.token));
  }

  /**
   * Refreshes the domain gauges from StatsService, at most once per
   * STATS_TTL_MS. Never throws: a failed refresh keeps the previous values,
   * so a database hiccup degrades freshness instead of breaking the scrape.
   */
  private refreshDomainMetrics(): Promise<void> {
    if (Date.now() - this.lastRefresh < MetricsService.STATS_TTL_MS) {
      return this.refreshPromise;
    }
    this.lastRefresh = Date.now();
    this.refreshPromise = this.statsService
      .getStats()
      .then((stats) => {
        this.libraryItems.set({ type: 'audiobooks' }, stats.audiobooks);
        this.libraryItems.set({ type: 'ebooks' }, stats.ebooks);
        this.libraryItems.set({ type: 'comics' }, stats.comics);
        this.requestsByStatus.set({ status: 'pending' }, stats.pendingRequests);
        this.requestsByStatus.set(
          { status: 'complete' },
          stats.finishedRequests,
        );
        this.requestsToday.set(stats.requestsToday);
        this.listeningSeconds.set(stats.totalListeningTimeSeconds);
      })
      .catch((error: unknown) => {
        this.logger.warn(`Stats refresh for metrics failed: ${String(error)}`);
      });
    return this.refreshPromise;
  }
}
