import { TtsApiClient, TtsApiError } from '../tts-api.client';

function makeResponse(
  overrides: Partial<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
    arrayBuffer: () => Promise<ArrayBuffer>;
  }> = {},
): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
    arrayBuffer: async () => new ArrayBuffer(4),
    ...overrides,
  } as unknown as Response;
}

describe('TtsApiClient', () => {
  it('normalizes base URLs with trailing slashes and /v1', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return makeResponse({ json: async () => ({ voices: [] }) });
    }) as typeof fetch;

    await new TtsApiClient('http://tts:8880/v1/', null, fetchImpl).listVoices();
    await new TtsApiClient('http://tts:8880/', null, fetchImpl).listVoices();

    expect(calls).toEqual([
      'http://tts:8880/v1/audio/voices',
      'http://tts:8880/v1/audio/voices',
    ]);
  });

  it('sends a bearer header only when an api key is set', async () => {
    const headersSeen: Array<Record<string, string>> = [];
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      headersSeen.push((init?.headers ?? {}) as Record<string, string>);
      return makeResponse({ json: async () => ({ voices: [] }) });
    }) as typeof fetch;

    await new TtsApiClient('http://x', 'secret', fetchImpl).listVoices();
    await new TtsApiClient('http://x', null, fetchImpl).listVoices();

    expect(headersSeen[0].Authorization).toBe('Bearer secret');
    expect(headersSeen[1].Authorization).toBeUndefined();
  });

  it('returns a Buffer from createSpeech and posts the OpenAI body shape', async () => {
    let body: Record<string, unknown> | undefined;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return makeResponse({
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      });
    }) as typeof fetch;

    const client = new TtsApiClient('http://x', null, fetchImpl);
    const result = await client.createSpeech('Hello.', {
      model: 'kokoro',
      voice: 'af_heart',
      speed: 1.2,
    });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([1, 2, 3]);
    expect(body).toEqual({
      model: 'kokoro',
      input: 'Hello.',
      voice: 'af_heart',
      speed: 1.2,
      response_format: 'wav',
    });
  });

  it('maps createSpeech HTTP errors to TtsApiError with the status', async () => {
    const fetchImpl = (async () =>
      makeResponse({
        ok: false,
        status: 500,
        text: async () => 'boom',
      })) as typeof fetch;

    const client = new TtsApiClient('http://x', null, fetchImpl);
    await expect(
      client.createSpeech('Hi', { model: 'm', voice: 'v', speed: 1 }),
    ).rejects.toMatchObject({ name: 'TtsApiError', status: 500 });
  });

  it('wraps network failures in TtsApiError with status 0', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    const client = new TtsApiClient('http://x', null, fetchImpl);
    await expect(client.listVoices()).rejects.toMatchObject({
      name: 'TtsApiError',
      status: 0,
    });
  });

  it('returns null voices on 404 (generic OpenAI-compatible servers)', async () => {
    const fetchImpl = (async () =>
      makeResponse({ ok: false, status: 404 })) as typeof fetch;
    const client = new TtsApiClient('http://x', null, fetchImpl);
    expect(await client.listVoices()).toBeNull();
  });

  it('accepts both bare arrays and {voices: []} payloads', async () => {
    const asObject = (async () =>
      makeResponse({
        json: async () => ({ voices: ['a', 'b'] }),
      })) as typeof fetch;
    const asArray = (async () =>
      makeResponse({ json: async () => ['c'] })) as typeof fetch;

    expect(
      await new TtsApiClient('http://x', null, asObject).listVoices(),
    ).toEqual(['a', 'b']);
    expect(
      await new TtsApiClient('http://x', null, asArray).listVoices(),
    ).toEqual(['c']);
  });

  it('accepts voice entries shaped as { id, name } objects', async () => {
    const fetchImpl = (async () =>
      makeResponse({
        json: async () => ({
          voices: [
            { id: 'af_heart', name: 'af_heart' },
            { name: 'am_michael' },
            42,
          ],
        }),
      })) as typeof fetch;

    expect(
      await new TtsApiClient('http://x', null, fetchImpl).listVoices(),
    ).toEqual(['af_heart', 'am_michael']);
  });

  it('testConnection falls back to a synthesis probe when voices are unavailable', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      if (String(url).endsWith('/voices')) {
        return makeResponse({ ok: false, status: 404 });
      }
      return makeResponse({
        arrayBuffer: async () => new ArrayBuffer(2),
      });
    }) as typeof fetch;

    const result = await new TtsApiClient(
      'http://x',
      null,
      fetchImpl,
    ).testConnection('v', 'm');

    expect(result).toEqual({ ok: true, voices: null });
    expect(urls[1]).toBe('http://x/v1/audio/speech');
  });

  it('testConnection reports failures instead of throwing', async () => {
    const fetchImpl = (async () => {
      throw new Error('refused');
    }) as typeof fetch;

    const result = await new TtsApiClient(
      'http://x',
      null,
      fetchImpl,
    ).testConnection('v', 'm');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('refused');
  });
});

describe('TtsApiError', () => {
  it('exposes status and name', () => {
    const error = new TtsApiError(429, 'too many');
    expect(error.status).toBe(429);
    expect(error.name).toBe('TtsApiError');
  });
});
