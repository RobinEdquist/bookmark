import { redactUrl, serializeRequestForLog } from './log-redaction.util';

describe('redactUrl', () => {
  it('returns undefined/empty input unchanged', () => {
    expect(redactUrl(undefined)).toBeUndefined();
    expect(redactUrl('')).toBe('');
  });

  it('leaves URLs without a query string unchanged', () => {
    expect(redactUrl('/api/audiobooks/abc/cover')).toBe(
      '/api/audiobooks/abc/cover',
    );
  });

  it('leaves harmless query params unchanged', () => {
    expect(redactUrl('/api/audiobooks?search=dune&limit=20')).toBe(
      '/api/audiobooks?search=dune&limit=20',
    );
  });

  it('redacts token query params', () => {
    expect(redactUrl('/api/audiobooks/abc/cover?token=bkmrk_secret123')).toBe(
      '/api/audiobooks/abc/cover?token=%5BREDACTED%5D',
    );
  });

  it('redacts case-insensitively and keeps other params', () => {
    const result = redactUrl('/api/x?limit=5&Token=bkmrk_abc&ApiKey=zzz');
    expect(result).not.toContain('bkmrk_abc');
    expect(result).not.toContain('zzz');
    expect(result).toContain('limit=5');
  });

  it('redacts OAuth callback codes and state', () => {
    const result = redactUrl(
      '/api/auth/callback/oidc?code=abc123&state=xyz789',
    );
    expect(result).not.toContain('abc123');
    expect(result).not.toContain('xyz789');
  });

  it('redacts repeated sensitive params', () => {
    const result = redactUrl('/api/x?token=one&token=two');
    expect(result).not.toContain('one');
    expect(result).not.toContain('two');
  });
});

describe('serializeRequestForLog', () => {
  const baseRequest = {
    id: 42,
    method: 'GET',
    url: '/api/audiobooks/abc/cover?token=bkmrk_secret123',
    remoteAddress: '10.0.0.5',
  };

  it('keeps only identifying fields, redacts the URL and drops all headers', () => {
    const result = serializeRequestForLog({
      ...baseRequest,
      headers: {
        cookie: 'better-auth.session_token=supersecret',
        authorization: 'Bearer bkmrk_token',
        'user-agent': 'Bookmark/1.0',
      },
    });

    expect(result).toEqual({
      id: 42,
      method: 'GET',
      url: '/api/audiobooks/abc/cover?token=%5BREDACTED%5D',
      remoteAddress: '10.0.0.5',
    });
    expect(result).not.toHaveProperty('client');
    expect(JSON.stringify(result)).not.toContain('supersecret');
    expect(JSON.stringify(result)).not.toContain('bkmrk_token');
  });

  it('logs the X-Bookmark-Client header as client', () => {
    const result = serializeRequestForLog({
      ...baseRequest,
      headers: {
        'x-bookmark-client': 'bookmark-iOS 1.0(26)',
        cookie: 'better-auth.session_token=supersecret',
      },
    });

    expect(result.client).toBe('bookmark-iOS 1.0(26)');
    expect(JSON.stringify(result)).not.toContain('supersecret');
  });

  it('omits client when the header is absent or empty', () => {
    expect(serializeRequestForLog(baseRequest)).not.toHaveProperty('client');
    expect(
      serializeRequestForLog({ ...baseRequest, headers: {} }),
    ).not.toHaveProperty('client');
    expect(
      serializeRequestForLog({
        ...baseRequest,
        headers: { 'x-bookmark-client': '' },
      }),
    ).not.toHaveProperty('client');
  });

  it('caps the client value at 100 characters', () => {
    const result = serializeRequestForLog({
      ...baseRequest,
      headers: { 'x-bookmark-client': 'bookmark-Android ' + 'x'.repeat(500) },
    });

    expect(result.client).toHaveLength(100);
    expect(result.client?.startsWith('bookmark-Android ')).toBe(true);
  });

  it('uses the first value when the header arrives as an array', () => {
    const result = serializeRequestForLog({
      ...baseRequest,
      headers: {
        'x-bookmark-client': [
          'bookmark-Android 1.2(34)',
          'bookmark-iOS 1.0(26)',
        ],
      },
    });

    expect(result.client).toBe('bookmark-Android 1.2(34)');
  });
});
