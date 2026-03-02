export interface RatingCandidates {
  goodreadsRating: number | null;
  goodreadsRatingsCount: number | null;
  hardcoverRating: number | null;
  hardcoverRatingsCount: number | null;
}

export interface RankableItem extends RatingCandidates {
  id: string;
  title: string;
  type: 'audiobook' | 'ebook';
}

export interface ResolvedRating {
  source: 'goodreads' | 'hardcover' | null;
  rating: number | null;
  ratingsCount: number | null;
}

export interface RankedTopListItem extends RankableItem {
  ratingSource: 'goodreads' | 'hardcover';
  rating: number;
  ratingsCount: number;
  weightedScore: number;
}

const PRIOR_MEAN = 3.8;
const PRIOR_WEIGHT = 200;

function clampRating(rating: number): number {
  return Math.min(Math.max(rating, 0), 5);
}

function normalizeCount(count: number | null): number {
  if (!count || Number.isNaN(count)) {
    return 0;
  }
  return Math.max(0, Math.floor(count));
}

export function resolvePreferredRating(data: RatingCandidates): ResolvedRating {
  if (data.goodreadsRating !== null) {
    return {
      source: 'goodreads',
      rating: data.goodreadsRating,
      ratingsCount: data.goodreadsRatingsCount,
    };
  }

  if (data.hardcoverRating !== null) {
    return {
      source: 'hardcover',
      rating: data.hardcoverRating,
      ratingsCount: data.hardcoverRatingsCount,
    };
  }

  return {
    source: null,
    rating: null,
    ratingsCount: null,
  };
}

// Bayesian weighted average so tiny vote counts do not dominate.
export function calculateWeightedRatingScore(
  rating: number,
  ratingsCount: number | null,
): number {
  const normalizedRating = clampRating(rating);
  const votes = normalizeCount(ratingsCount);
  return (
    (votes / (votes + PRIOR_WEIGHT)) * normalizedRating +
    (PRIOR_WEIGHT / (votes + PRIOR_WEIGHT)) * PRIOR_MEAN
  );
}

export function rankTopListItems(
  items: RankableItem[],
  limit: number,
): RankedTopListItem[] {
  return items
    .map((item) => {
      const preferred = resolvePreferredRating(item);
      if (
        preferred.source === null ||
        preferred.rating === null ||
        Number.isNaN(preferred.rating)
      ) {
        return null;
      }

      const ratingsCount = normalizeCount(preferred.ratingsCount);
      const rating = clampRating(preferred.rating);
      const weightedScore = calculateWeightedRatingScore(rating, ratingsCount);

      return {
        ...item,
        ratingSource: preferred.source,
        rating,
        ratingsCount,
        weightedScore,
      };
    })
    .filter((item): item is RankedTopListItem => item !== null)
    .sort((a, b) => {
      if (b.weightedScore !== a.weightedScore) {
        return b.weightedScore - a.weightedScore;
      }
      if (b.ratingsCount !== a.ratingsCount) {
        return b.ratingsCount - a.ratingsCount;
      }
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}
