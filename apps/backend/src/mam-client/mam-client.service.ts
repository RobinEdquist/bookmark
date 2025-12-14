import { Injectable, Logger, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MamSearchParams,
  MamSearchResponse,
  MamDownloadResponse,
  TorrentStatus,
  BulkTorrentStatus,
} from './types';

@Injectable()
export class MamClientService {
  private readonly logger = new Logger(MamClientService.name);
  private readonly baseUrl: string | undefined;
  private readonly apiKey: string | undefined;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('MAM_CLIENT_URL');
    this.apiKey = this.configService.get<string>('MAM_CLIENT_API_KEY');
  }

  isConfigured(): boolean {
    return !!(this.baseUrl && this.apiKey);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new HttpException('MAM client not configured', 503);
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
        this.logger.error(`MAM client error: ${response.status} ${errorText}`);
        throw new HttpException(
          `MAM client error: ${response.statusText}`,
          response.status,
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`MAM client request failed: ${error}`);
      throw new HttpException('MAM client unavailable', 503);
    }
  }

  async search(params: MamSearchParams): Promise<MamSearchResponse> {
    // Force audiobooks and ebooks categories only
    const searchParams: MamSearchParams = {
      ...params,
      main_cat: [13, 14], // 13=Audiobooks, 14=Ebooks
    };

    return this.request<MamSearchResponse>('POST', '/search', {
      tor: searchParams,
      description: true,
    });
  }

  async download(mamTorrentId: string): Promise<MamDownloadResponse> {
    return this.request<MamDownloadResponse>(
      'POST',
      `/download/${mamTorrentId}`,
      {},
    );
  }

  async getTorrentStatus(hash: string): Promise<TorrentStatus> {
    return this.request<TorrentStatus>('GET', `/torrent/${hash}`);
  }

  async getBulkTorrentStatus(hashes: string[]): Promise<BulkTorrentStatus> {
    const hashesParam = hashes.join(',');
    return this.request<BulkTorrentStatus>(
      'GET',
      `/torrents?hashes=${hashesParam}`,
    );
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
