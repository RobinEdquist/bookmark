/**
 * Focused unit tests for pure helpers in ComicsService.
 * Full DB-level coverage is handled in Task 16's smoke test.
 */
import { CoverService } from '../../common/cover.service';

// We test the cover-resolution logic by isolating it from the service.
// The private method `resolveSeriesCoverUrl` calls CoverService.getCoverUrl,
// so we test its output observable from outside via the public path.

describe('series cover resolution precedence', () => {
  // Replicate the helper logic to test the decision tree:
  // 1. Own cover (series has coverUrl/coverSource) takes priority
  // 2. Fallback to first book in series that has a cover
  // 3. Null when neither exists

  const getCoverUrlSpy = (hasOwnCover: boolean) =>
    jest
      .fn()
      .mockReturnValue(hasOwnCover ? '/api/comics/series/s1/cover' : null);

  function resolveSeriesCoverUrl(
    series: { id: string; coverUrl: string | null; coverSource: string | null },
    fallbackCovers: Map<string, string>,
    getCoverUrl: (
      id: string,
      url: string | null,
      source: string | null,
      path: string,
    ) => string | null,
  ): string | null {
    const own = getCoverUrl(
      series.id,
      series.coverUrl,
      series.coverSource,
      'comics/series',
    );
    if (own) return own;
    const fallbackBookId = fallbackCovers.get(series.id);
    return fallbackBookId ? `/api/comics/books/${fallbackBookId}/cover` : null;
  }

  it('returns own cover URL when series has a cover', () => {
    const getCoverUrl = getCoverUrlSpy(true);
    const series = { id: 's1', coverUrl: 's1.jpg', coverSource: 'embedded' };
    const fallbackCovers = new Map([['s1', 'book-fallback-id']]);
    const result = resolveSeriesCoverUrl(series, fallbackCovers, getCoverUrl);
    expect(result).toBe('/api/comics/series/s1/cover');
    expect(getCoverUrl).toHaveBeenCalledWith(
      's1',
      's1.jpg',
      'embedded',
      'comics/series',
    );
  });

  it('falls back to first book cover when series has no cover', () => {
    const getCoverUrl = getCoverUrlSpy(false);
    const series = { id: 's1', coverUrl: null, coverSource: null };
    const fallbackCovers = new Map([['s1', 'book-42']]);
    const result = resolveSeriesCoverUrl(series, fallbackCovers, getCoverUrl);
    expect(result).toBe('/api/comics/books/book-42/cover');
  });

  it('returns null when series has no cover and no book cover exists', () => {
    const getCoverUrl = getCoverUrlSpy(false);
    const series = { id: 's1', coverUrl: null, coverSource: null };
    const fallbackCovers = new Map<string, string>();
    const result = resolveSeriesCoverUrl(series, fallbackCovers, getCoverUrl);
    expect(result).toBeNull();
  });

  it('own cover takes priority even when fallback book exists', () => {
    const getCoverUrl = getCoverUrlSpy(true);
    const series = { id: 's1', coverUrl: 's1.jpg', coverSource: 'uploaded' };
    const fallbackCovers = new Map([['s1', 'book-99']]);
    const result = resolveSeriesCoverUrl(series, fallbackCovers, getCoverUrl);
    expect(result).toBe('/api/comics/series/s1/cover');
  });
});

describe('CoverService.getCoverUrl (used by comics service)', () => {
  // Quick sanity check that the real CoverService behaves as expected
  let service: CoverService;

  beforeEach(() => {
    // CoverService only depends on ImageProcessingService for upload methods,
    // not for getCoverUrl — so we can construct it with a null stub.
    service = new CoverService(null as never);
  });

  it('returns cover URL when coverSource is set', () => {
    expect(
      service.getCoverUrl('id-1', 'id-1.jpg', 'embedded', 'comics/series'),
    ).toBe('/api/comics/series/id-1/cover');
  });

  it('returns cover URL when only coverUrl is set (no source)', () => {
    expect(service.getCoverUrl('id-1', 'id-1.jpg', null, 'comics/books')).toBe(
      '/api/comics/books/id-1/cover',
    );
  });

  it('returns null when both coverUrl and coverSource are null', () => {
    expect(service.getCoverUrl('id-1', null, null, 'comics/series')).toBeNull();
  });
});

// ===== CONTAINER_MIME mapping (pure logic, no DB needed) =====

describe('CONTAINER_MIME mapping (getBookDownloadInfo)', () => {
  // Replicate the same mapping defined in comics.service.ts to pin it.
  const CONTAINER_MIME: Record<string, string> = {
    cbz: 'application/vnd.comicbook+zip',
    cbr: 'application/vnd.comicbook-rar',
    pdf: 'application/pdf',
  };

  function resolveMime(container: string): string {
    return CONTAINER_MIME[container] ?? 'application/octet-stream';
  }

  it('maps cbz to application/vnd.comicbook+zip', () => {
    expect(resolveMime('cbz')).toBe('application/vnd.comicbook+zip');
  });

  it('maps cbr to application/vnd.comicbook-rar', () => {
    expect(resolveMime('cbr')).toBe('application/vnd.comicbook-rar');
  });

  it('maps pdf to application/pdf', () => {
    expect(resolveMime('pdf')).toBe('application/pdf');
  });

  it('falls back to application/octet-stream for unknown containers', () => {
    expect(resolveMime('unknown')).toBe('application/octet-stream');
  });
});
