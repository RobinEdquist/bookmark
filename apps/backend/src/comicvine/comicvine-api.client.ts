// ---------------------------------------------------------------------------
// ComicVine REST API client
// ---------------------------------------------------------------------------
// Thin, dependency-light client. Takes an apiKey + an injectable fetchImpl
// (defaults to globalThis.fetch) so tests can pass a mock without any module
// patching. Does NOT touch the DB or settings.
// ---------------------------------------------------------------------------

const BASE_URL = 'https://comicvine.gamespot.com/api';

/** Tight field lists — only the columns we actually use. */
const VOLUME_FIELD_LIST =
  'id,name,start_year,publisher,count_of_issues,description,image,site_detail_url';

const ISSUE_FIELD_LIST =
  'id,issue_number,name,cover_date,store_date,volume,person_credits,character_credits,story_arc_credits,description,image,site_detail_url';

const USER_AGENT = 'Bookmark/1.0 (+https://github.com/bookmark)';

/** Resource-type prefixes used in single-resource paths. */
const VOLUME_PREFIX = '4050';
const ISSUE_PREFIX = '4000';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ComicVineApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly rateLimited = false,
  ) {
    super(message);
    this.name = 'ComicVineApiError';
  }
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/** Shape returned by parseEnvelope for list calls. */
export interface ComicVineListResult<T> {
  totalResults: number;
  results: T[];
}

/** Shape returned by parseEnvelope for single-resource calls. */
export interface ComicVineSingleResult<T> {
  totalResults: number;
  results: T;
}

interface ComicVineEnvelope<T> {
  status_code: number;
  error: string;
  number_of_total_results: number;
  results: T;
}

// ---------------------------------------------------------------------------
// Pagination options
// ---------------------------------------------------------------------------

export interface ComicVinePageOptions {
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ComicVineApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  async searchVolumes(
    query: string,
    { page, limit }: ComicVinePageOptions,
  ): Promise<ComicVineListResult<unknown>> {
    const params = this.baseParams(VOLUME_FIELD_LIST);
    params.set('filter', `name:${query}`);
    params.set('limit', String(limit));
    params.set('offset', String((page - 1) * limit));

    const envelope = await this.get<unknown[]>(`${BASE_URL}/volumes/`, params);
    return {
      totalResults: envelope.number_of_total_results,
      results: envelope.results,
    };
  }

  async getVolume(volumeId: number): Promise<ComicVineSingleResult<unknown>> {
    const params = this.baseParams(VOLUME_FIELD_LIST);
    const envelope = await this.get<unknown>(
      `${BASE_URL}/volume/${VOLUME_PREFIX}-${volumeId}/`,
      params,
    );
    return {
      totalResults: envelope.number_of_total_results,
      results: envelope.results,
    };
  }

  async getVolumeIssues(
    volumeId: number,
    { page, limit }: ComicVinePageOptions,
  ): Promise<ComicVineListResult<unknown>> {
    const params = this.baseParams(ISSUE_FIELD_LIST);
    params.set('filter', `volume:${volumeId}`);
    params.set('limit', String(limit));
    params.set('offset', String((page - 1) * limit));

    const envelope = await this.get<unknown[]>(`${BASE_URL}/issues/`, params);
    return {
      totalResults: envelope.number_of_total_results,
      results: envelope.results,
    };
  }

  async searchIssues(
    query: string,
    { page, limit }: ComicVinePageOptions,
  ): Promise<ComicVineListResult<unknown>> {
    const params = this.baseParams(ISSUE_FIELD_LIST);
    params.set('filter', `name:${query}`);
    params.set('limit', String(limit));
    params.set('offset', String((page - 1) * limit));

    const envelope = await this.get<unknown[]>(`${BASE_URL}/issues/`, params);
    return {
      totalResults: envelope.number_of_total_results,
      results: envelope.results,
    };
  }

  async getIssue(issueId: number): Promise<ComicVineSingleResult<unknown>> {
    const params = this.baseParams(ISSUE_FIELD_LIST);
    const envelope = await this.get<unknown>(
      `${BASE_URL}/issue/${ISSUE_PREFIX}-${issueId}/`,
      params,
    );
    return {
      totalResults: envelope.number_of_total_results,
      results: envelope.results,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private baseParams(fieldList: string): URLSearchParams {
    const params = new URLSearchParams();
    params.set('api_key', this.apiKey);
    params.set('format', 'json');
    params.set('field_list', fieldList);
    return params;
  }

  private async get<T>(
    url: string,
    params: URLSearchParams,
  ): Promise<ComicVineEnvelope<T>> {
    const fullUrl = `${url}?${params.toString()}`;
    const headers = { 'User-Agent': USER_AGENT };

    const res = await this.fetchImpl(fullUrl, { headers });

    return this.parseEnvelope<T>(res);
  }

  private async parseEnvelope<T>(res: Response): Promise<ComicVineEnvelope<T>> {
    // Rate-limit signals: HTTP 420 or 429
    if (res.status === 420 || res.status === 429) {
      throw new ComicVineApiError(0, 'rate limited', true);
    }

    // Other non-OK responses
    if (!res.ok) {
      throw new ComicVineApiError(0, `HTTP ${res.status}`);
    }

    const body = (await res.json()) as ComicVineEnvelope<T>;

    // API-level errors (status_code !== 1 means error)
    if (body.status_code !== 1) {
      throw new ComicVineApiError(
        body.status_code,
        body.error ?? 'Unknown error',
      );
    }

    return body;
  }
}
