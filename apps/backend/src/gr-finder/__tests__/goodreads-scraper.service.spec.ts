import { GoodreadsScraperService } from '../goodreads-scraper.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const autoCompleteEntry = {
  title: 'The Hobbit',
  bookTitleBare: 'The Hobbit',
  bookUrl: '/book/show/5907-the-hobbit?from_search=true',
  bookId: 5907,
  author: { name: 'J.R.R. Tolkien' },
  imageUrl: 'https://images.gr-assets.com/books/1546071216s/5907.jpg',
  avgRating: 4.28,
};

/** Trimmed-down version of a rendered Goodreads book page. */
const bookPageHtml = `
<html><body>
  <img class="ResponsiveImage" src="https://images.gr-assets.com/books/1546071216l/5907.jpg" />
  <h1 class="Text__title1">The Hobbit, or There and Back Again</h1>
  <span class="ContributorLink__name">J.R.R. Tolkien</span>
  <div class="RatingStatistics__rating">4.28</div>
  <span data-testid="ratingsCount">3,585,905 ratings</span>
  <span class="BookPageMetadataSection__genreButton">
    <a class="Button--tag" href="/genres/fantasy">Fantasy</a>
  </span>
  <span class="BookPageMetadataSection__genreButton">
    <a class="Button--tag" href="/genres/classics">Classics</a>
  </span>
  <a href="/series/66175-the-lord-of-the-rings">The Lord of the Rings #0</a>
  <div class="DetailsLayoutRightParagraph__widthConstrained">
    <span class="Formatted">In a hole in the ground there lived a hobbit.</span>
  </div>
</body></html>
`;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockFetch: jest.Mock;
let service: GoodreadsScraperService;

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
  service = new GoodreadsScraperService();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoodreadsScraperService', () => {
  describe('searchBooks', () => {
    it('queries the auto_complete endpoint and maps entries', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([autoCompleteEntry]),
      });

      const results = await service.searchBooks('the hobbit');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.goodreads.com/book/auto_complete?format=json&q=the+hobbit',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/json' }),
        }),
      );
      expect(results).toEqual([
        {
          title: 'The Hobbit',
          author: 'J.R.R. Tolkien',
          goodreads_id: '5907-the-hobbit',
          cover_url: 'https://images.gr-assets.com/books/1546071216s/5907.jpg',
          avg_rating: '4.28',
          url: 'https://www.goodreads.com/book/show/5907-the-hobbit?from_search=true',
        },
      ]);
    });

    it('falls back to bookId when bookUrl is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValue([
            { ...autoCompleteEntry, bookUrl: undefined, bookId: 5907 },
          ]),
      });

      const [result] = await service.searchBooks('the hobbit');

      expect(result!.goodreads_id).toBe('5907');
      expect(result!.url).toBe('');
    });

    it('defaults author and title when fields are missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ bookId: 1 }]),
      });

      const [result] = await service.searchBooks('anything');

      expect(result).toEqual({
        title: 'Unknown',
        author: 'Unknown',
        goodreads_id: '1',
        cover_url: null,
        avg_rating: null,
        url: '',
      });
    });

    it('returns empty list for a non-array payload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ error: 'nope' }),
      });

      await expect(service.searchBooks('query')).resolves.toEqual([]);
    });

    it('returns empty list when the payload is not JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('invalid json')),
      });

      await expect(service.searchBooks('query')).resolves.toEqual([]);
    });

    it('throws on a non-OK response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 });

      await expect(service.searchBooks('query')).rejects.toThrow(
        'Goodreads search failed with status 503',
      );
    });
  });

  describe('parseBookDetails', () => {
    it('extracts all fields from a rendered book page', () => {
      const details = service.parseBookDetails(bookPageHtml);

      expect(details).toEqual({
        title: 'The Hobbit, or There and Back Again',
        author: 'J.R.R. Tolkien',
        cover_url: 'https://images.gr-assets.com/books/1546071216l/5907.jpg',
        rating: 4.28,
        rating_count: 3585905,
        genres: ['Fantasy', 'Classics'],
        description: 'In a hole in the ground there lived a hobbit.',
        series: 'The Lord of the Rings',
        series_number: '0',
      });
    });

    it('handles a series link without a number', () => {
      const html = bookPageHtml.replace(
        'The Lord of the Rings #0',
        'The Lord of the Rings',
      );

      const details = service.parseBookDetails(html);

      expect(details.series).toBe('The Lord of the Rings');
      expect(details.series_number).toBeNull();
    });

    it('falls back to generic genre links when tag buttons are absent', () => {
      const html = `
        <html><body>
          <h1 class="Text__title1">Some Book</h1>
          <a href="/genres/horror">Horror</a>
          <a href="/genres/horror">Horror</a>
          <a href="/genres/thriller">Thriller</a>
        </body></html>
      `;

      const details = service.parseBookDetails(html);

      expect(details.genres).toEqual(['Horror', 'Thriller']);
    });

    it('returns Unknown/null fields for a page that failed to render', () => {
      const details = service.parseBookDetails('<html><body></body></html>');

      expect(details).toEqual({
        title: 'Unknown',
        author: 'Unknown',
        cover_url: null,
        rating: null,
        rating_count: null,
        genres: [],
        description: null,
        series: null,
        series_number: null,
      });
    });
  });
});
