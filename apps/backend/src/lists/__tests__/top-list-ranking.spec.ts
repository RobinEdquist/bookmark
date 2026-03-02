import {
  calculateWeightedRatingScore,
  resolvePreferredRating,
  rankTopListItems,
  type RankableItem,
} from '../top-list-ranking';

describe('top-list-ranking', () => {
  describe('resolvePreferredRating', () => {
    it('prefers goodreads rating and count when available', () => {
      const result = resolvePreferredRating({
        goodreadsRating: 4.12,
        goodreadsRatingsCount: 12650,
        hardcoverRating: 4.9,
        hardcoverRatingsCount: 5,
      });

      expect(result).toEqual({
        source: 'goodreads',
        rating: 4.12,
        ratingsCount: 12650,
      });
    });

    it('falls back to hardcover when goodreads is missing', () => {
      const result = resolvePreferredRating({
        goodreadsRating: null,
        goodreadsRatingsCount: null,
        hardcoverRating: 4.3,
        hardcoverRatingsCount: 2400,
      });

      expect(result).toEqual({
        source: 'hardcover',
        rating: 4.3,
        ratingsCount: 2400,
      });
    });
  });

  describe('calculateWeightedRatingScore', () => {
    it('rewards high vote count over tiny sample size', () => {
      const nearPerfectTinySample = calculateWeightedRatingScore(5, 1);
      const strongLargeSample = calculateWeightedRatingScore(4.2, 100_000);

      expect(strongLargeSample).toBeGreaterThan(nearPerfectTinySample);
    });
  });

  describe('rankTopListItems', () => {
    it('ranks items by weighted score using preferred source', () => {
      const items: RankableItem[] = [
        {
          id: 'a',
          title: 'Tiny perfect',
          type: 'audiobook',
          goodreadsRating: 5,
          goodreadsRatingsCount: 1,
          hardcoverRating: 5,
          hardcoverRatingsCount: 1,
        },
        {
          id: 'b',
          title: 'Crowd favorite',
          type: 'ebook',
          goodreadsRating: 4.2,
          goodreadsRatingsCount: 100_000,
          hardcoverRating: 4.3,
          hardcoverRatingsCount: 50,
        },
        {
          id: 'c',
          title: 'Hardcover only',
          type: 'audiobook',
          goodreadsRating: null,
          goodreadsRatingsCount: null,
          hardcoverRating: 4.05,
          hardcoverRatingsCount: 3_000,
        },
      ];

      const ranked = rankTopListItems(items, 3);

      expect(ranked).toHaveLength(3);
      expect(ranked[0]?.id).toBe('b');
      expect(ranked[0]?.ratingSource).toBe('goodreads');
      expect(ranked[1]?.id).toBe('c');
      expect(ranked[1]?.ratingSource).toBe('hardcover');
      expect(ranked[2]?.id).toBe('a');
    });

    it('filters items without usable ratings', () => {
      const items: RankableItem[] = [
        {
          id: 'a',
          title: 'Unrated',
          type: 'audiobook',
          goodreadsRating: null,
          goodreadsRatingsCount: null,
          hardcoverRating: null,
          hardcoverRatingsCount: null,
        },
      ];

      const ranked = rankTopListItems(items, 10);
      expect(ranked).toEqual([]);
    });
  });
});
