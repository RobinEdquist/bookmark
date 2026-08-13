import { redactUrl } from './log-redaction.util';

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
      '/api/auth/oauth2/callback/oidc?code=abc123&state=xyz789',
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
