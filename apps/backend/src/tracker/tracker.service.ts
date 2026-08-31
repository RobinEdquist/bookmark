import { Injectable, Logger, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  TrackerSearchParams,
  TrackerSearchResponse,
  TrackerLanguagesResponse,
  TrackerDownloadOptions,
  TrackerDownloadResponse,
  TorrentStatus,
  BulkTorrentStatus,
} from './types';

@Injectable()
export class TrackerService {
  private readonly logger = new Logger(TrackerService.name);
  private readonly baseUrl: string | undefined;
  private readonly apiKey: string | undefined;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('TRACKER_CLIENT_URL');
    this.apiKey = this.configService.get<string>('TRACKER_CLIENT_API_KEY');
  }

  isConfigured(): boolean {
    return !!(this.baseUrl && this.apiKey);
  }

  /**
   * Validates a path segment before it is interpolated into an upstream URL
   * that carries the tracker API key. Unvalidated values would let a caller
   * reach arbitrary paths on the tracker host (`..%2f`, `?`, `#`). Torrent
   * ids and info-hashes are alphanumeric; anything else is rejected.
   */
  private validateSegment(value: string, field: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      throw new HttpException(`Invalid ${field}`, 400);
    }
    return value;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new HttpException('Tracker client not configured', 503);
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey!,
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Tracker client error: ${response.status} ${errorText}`,
        );
        throw new HttpException(
          `Tracker client error: ${response.statusText}`,
          response.status,
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Tracker client request failed: ${error}`);
      throw new HttpException('Tracker client unavailable', 503);
    }
  }

  async search(params: TrackerSearchParams): Promise<TrackerSearchResponse> {
    // Default to audiobooks and ebooks if not specified
    return this.request<TrackerSearchResponse>('POST', '/search', {
      query: params.query,
      categories: params.categories ?? ['audiobook', 'ebook'],
      searchIn: params.searchIn,
      languages: params.languages,
      perPage: params.perPage,
      offset: params.offset,
    });
  }

  async getLanguages(): Promise<TrackerLanguagesResponse> {
    return this.request<TrackerLanguagesResponse>('GET', '/languages');
  }

  async download(
    torrentId: string,
    options?: TrackerDownloadOptions,
  ): Promise<TrackerDownloadResponse> {
    return this.request<TrackerDownloadResponse>(
      'POST',
      `/download/${this.validateSegment(torrentId, 'torrent id')}`,
      options ?? {},
    );
  }

  async getTorrentStatus(hash: string): Promise<TorrentStatus> {
    return this.request<TorrentStatus>(
      'GET',
      `/torrent/${this.validateSegment(hash, 'torrent hash')}`,
    );
  }

  async getBulkTorrentStatus(hashes: string[]): Promise<BulkTorrentStatus> {
    // Hashes originate from tracker responses / stored download results, not
    // directly from user input — drop (rather than fail) anything malformed.
    // After filtering, the join is guaranteed free of separators/injection.
    const valid = hashes.filter((hash) => {
      try {
        this.validateSegment(hash, 'torrent hash');
        return true;
      } catch {
        this.logger.warn(`Skipping malformed torrent hash: ${hash}`);
        return false;
      }
    });
    const hashesParam = valid.join(',');
    return this.request<BulkTorrentStatus>(
      'GET',
      `/torrents?hashes=${hashesParam}`,
    );
  }

  async proxyImage(torrentId: string, res: Response): Promise<void> {
    if (!this.isConfigured()) {
      throw new HttpException('Tracker client not configured', 503);
    }

    // `torrentId` is a raw route parameter — without this check a request
    // like /requests/cover/..%2f..%2fdownload/<id> would make the backend
    // call arbitrary tracker-client endpoints with the API key attached.
    this.validateSegment(torrentId, 'torrent id');
    const url = `${this.baseUrl}/image/${encodeURIComponent(torrentId)}`;

    try {
      const upstream = await fetch(url, {
        headers: { 'X-API-Key': this.apiKey! },
      });

      if (!upstream.ok) {
        throw new HttpException(`Image not found`, upstream.status);
      }

      // Forward relevant headers
      const contentType = upstream.headers.get('content-type');
      const cacheControl = upstream.headers.get('cache-control');
      const etag = upstream.headers.get('etag');

      if (contentType) res.setHeader('Content-Type', contentType);
      if (cacheControl) {
        res.setHeader('Cache-Control', cacheControl);
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      if (etag) res.setHeader('ETag', etag);

      // Stream the body
      const body = upstream.body;
      if (!body) {
        res.status(204).end();
        return;
      }

      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        reader.releaseLock();
      }
      res.end();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to proxy image: ${error}`);
      throw new HttpException('Failed to proxy image', 502);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
