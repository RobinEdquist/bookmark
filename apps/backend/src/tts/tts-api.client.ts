// ---------------------------------------------------------------------------
// OpenAI-compatible text-to-speech API client
// ---------------------------------------------------------------------------
// Thin, dependency-light client for any server exposing the OpenAI
// /v1/audio/speech contract (self-hosted engines and cloud APIs alike).
// Takes a baseUrl + optional apiKey + an injectable fetchImpl so tests can
// pass a mock without module patching. Does NOT touch the DB or settings.
// ---------------------------------------------------------------------------

import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';

// CPU synthesis of a chunk can take minutes before the first response byte
// arrives; undici's default 5-minute headersTimeout would kill the request.
const SPEECH_TIMEOUT_MS = 15 * 60 * 1000;
const PROBE_TIMEOUT_MS = 60 * 1000;

// Shared long-timeout dispatcher for real fetches (lazily created so unit
// tests with a mock fetchImpl never allocate sockets).
let longTimeoutAgent: Agent | null = null;
function getLongTimeoutAgent(): Agent {
  if (!longTimeoutAgent) {
    longTimeoutAgent = new Agent({
      headersTimeout: SPEECH_TIMEOUT_MS,
      bodyTimeout: SPEECH_TIMEOUT_MS,
    });
  }
  return longTimeoutAgent;
}

export class TtsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TtsApiError';
  }
}

export interface SpeechOptions {
  model: string;
  voice: string;
  speed: number;
}

export interface TtsConnectionResult {
  ok: boolean;
  /** null when the server has no voice-listing endpoint (generic OpenAI). */
  voices: string[] | null;
  error?: string;
}

export class TtsApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey?: string | null,
    // undici's own fetch, NOT the Node global: the long-timeout Agent below
    // comes from the undici npm package, and Node's built-in fetch bundles a
    // different undici whose dispatcher interface is incompatible
    // ("invalid onRequestStart method").
    private readonly fetchImpl: typeof fetch = undiciFetch as unknown as typeof fetch,
  ) {
    // Accept both "http://tts:8880" and "http://tts:8880/v1" (with or
    // without a trailing slash).
    this.baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  }

  /** Synthesize a chunk of text into a WAV buffer. */
  async createSpeech(
    input: string,
    opts: SpeechOptions,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    const timeout = AbortSignal.timeout(SPEECH_TIMEOUT_MS);
    const res = await this.request('/v1/audio/speech', {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model: opts.model,
        input,
        voice: opts.voice,
        speed: opts.speed,
        response_format: 'wav',
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });

    if (!res.ok) {
      throw new TtsApiError(res.status, await this.errorMessage(res));
    }

    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * List available voices. Returns null when the endpoint doesn't exist
   * (plain OpenAI-compatible servers) so callers can fall back to free-text
   * voice input.
   */
  async listVoices(): Promise<string[] | null> {
    const res = await this.request('/v1/audio/voices', {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (res.status === 404 || res.status === 405) return null;
    if (!res.ok) {
      throw new TtsApiError(res.status, await this.errorMessage(res));
    }

    const body = (await res.json()) as unknown;
    if (Array.isArray(body)) {
      return this.toVoiceNames(body);
    }
    if (body && typeof body === 'object' && 'voices' in body) {
      const voices = (body as { voices: unknown }).voices;
      if (Array.isArray(voices)) {
        return this.toVoiceNames(voices);
      }
    }
    return null;
  }

  /** Servers return either plain strings or { id, name } objects. */
  private toVoiceNames(entries: unknown[]): string[] {
    return entries
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const voice = entry as { id?: unknown; name?: unknown };
          if (typeof voice.id === 'string') return voice.id;
          if (typeof voice.name === 'string') return voice.name;
        }
        return null;
      })
      .filter((name): name is string => !!name);
  }

  /**
   * Check that the server is reachable and can synthesize speech. Prefers
   * the voice-listing endpoint; falls back to a one-word synthesis probe.
   */
  async testConnection(
    voice: string,
    model: string,
  ): Promise<TtsConnectionResult> {
    try {
      const voices = await this.listVoices();
      if (voices !== null) {
        return { ok: true, voices };
      }
      await this.createSpeech('Hi.', { model, voice, speed: 1.0 });
      return { ok: true, voices: null };
    } catch (error) {
      return {
        ok: false,
        voices: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.apiKey
      ? { ...extra, Authorization: `Bearer ${this.apiKey}` }
      : extra;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      // `dispatcher` is undici's fetch extension; harmless for mock impls.
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        dispatcher: getLongTimeoutAgent(),
      } as RequestInit & { dispatcher: Dispatcher });
    } catch (error) {
      throw new TtsApiError(
        0,
        `TTS server unreachable at ${this.baseUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async errorMessage(res: Response): Promise<string> {
    const text = await res.text().catch(() => '');
    const snippet = text.slice(0, 300);
    return `TTS request failed with HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`;
  }
}
