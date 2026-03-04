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
  goodreadsBookId?: string | null;
  hardcoverBookId?: string | null;
}

export interface GroupedRankableItems {
  groupId: string;
  representative: RankableItem;
  members: RankableItem[];
}

export interface CanonicalGroupIdentity {
  id: string;
  source: 'goodreads' | 'hardcover' | 'media';
}

export interface ResolvedRating {
  source: 'goodreads' | 'hardcover' | null;
  rating: number | null;
  ratingsCount: number | null;
}

export type RatingSource = 'goodreads' | 'hardcover';

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

export function resolvePreferredRating(
  data: RatingCandidates,
  sourcePriority: RatingSource[] = ['goodreads', 'hardcover'],
): ResolvedRating {
  for (const source of sourcePriority) {
    if (source === 'goodreads' && data.goodreadsRating !== null) {
      return {
        source: 'goodreads',
        rating: data.goodreadsRating,
        ratingsCount: data.goodreadsRatingsCount,
      };
    }
    if (source === 'hardcover' && data.hardcoverRating !== null) {
      return {
        source: 'hardcover',
        rating: data.hardcoverRating,
        ratingsCount: data.hardcoverRatingsCount,
      };
    }
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

function getLinkageKeys(item: RankableItem): string[] {
  const keys: string[] = [];

  if (item.goodreadsBookId) {
    keys.push(`goodreads:${item.goodreadsBookId}`);
  }
  if (item.hardcoverBookId) {
    keys.push(`hardcover:${item.hardcoverBookId}`);
  }

  return keys;
}

function getUniqueSortedValues(
  values: Array<string | null | undefined>,
): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort();
}

export function getCanonicalGroupIdentity(
  members: RankableItem[],
): CanonicalGroupIdentity {
  const goodreadsIds = getUniqueSortedValues(
    members.map((member) => member.goodreadsBookId),
  );
  if (goodreadsIds[0]) {
    return {
      id: goodreadsIds[0],
      source: 'goodreads',
    };
  }

  const hardcoverIds = getUniqueSortedValues(
    members.map((member) => member.hardcoverBookId),
  );
  if (hardcoverIds[0]) {
    return {
      id: hardcoverIds[0],
      source: 'hardcover',
    };
  }

  const mediaIds = members
    .map((member) => `${member.type}:${member.id}`)
    .sort();
  return {
    id: mediaIds[0] ?? 'media:unknown',
    source: 'media',
  };
}

function getRankingSnapshot(
  item: RankableItem,
  sourcePriority: RatingSource[],
): {
  hasRating: boolean;
  weightedScore: number;
  ratingsCount: number;
  rating: number;
} {
  const preferred = resolvePreferredRating(item, sourcePriority);
  if (
    preferred.source === null ||
    preferred.rating === null ||
    Number.isNaN(preferred.rating)
  ) {
    return {
      hasRating: false,
      weightedScore: 0,
      ratingsCount: 0,
      rating: 0,
    };
  }

  const ratingsCount = normalizeCount(preferred.ratingsCount);
  const rating = clampRating(preferred.rating);
  const weightedScore = calculateWeightedRatingScore(rating, ratingsCount);

  return {
    hasRating: true,
    weightedScore,
    ratingsCount,
    rating,
  };
}

function pickRepresentative(
  members: RankableItem[],
  sourcePriority: RatingSource[],
): RankableItem {
  const sorted = [...members].sort((a, b) => {
    const aSnapshot = getRankingSnapshot(a, sourcePriority);
    const bSnapshot = getRankingSnapshot(b, sourcePriority);

    if (aSnapshot.hasRating !== bSnapshot.hasRating) {
      return aSnapshot.hasRating ? -1 : 1;
    }
    if (bSnapshot.weightedScore !== aSnapshot.weightedScore) {
      return bSnapshot.weightedScore - aSnapshot.weightedScore;
    }
    if (bSnapshot.ratingsCount !== aSnapshot.ratingsCount) {
      return bSnapshot.ratingsCount - aSnapshot.ratingsCount;
    }
    if (bSnapshot.rating !== aSnapshot.rating) {
      return bSnapshot.rating - aSnapshot.rating;
    }
    if (a.type !== b.type) {
      return a.type === 'audiobook' ? -1 : 1;
    }
    const titleComparison = a.title.localeCompare(b.title);
    if (titleComparison !== 0) {
      return titleComparison;
    }
    return a.id.localeCompare(b.id);
  });

  return sorted[0] ?? members[0];
}

export function groupRankableItemsBySource(
  items: RankableItem[],
  sourcePriority: RatingSource[] = ['goodreads', 'hardcover'],
): GroupedRankableItems[] {
  if (items.length === 0) {
    return [];
  }

  const parent = items.map((_, index) => index);
  const sourceToIndex = new Map<string, number>();

  const find = (index: number): number => {
    if (parent[index] === index) {
      return index;
    }
    const root = find(parent[index] ?? index);
    parent[index] = root;
    return root;
  };

  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootB] = rootA;
    }
  };

  items.forEach((item, index) => {
    for (const key of getLinkageKeys(item)) {
      const existingIndex = sourceToIndex.get(key);
      if (existingIndex === undefined) {
        sourceToIndex.set(key, index);
      } else {
        union(index, existingIndex);
      }
    }
  });

  const groupsByRoot = new Map<number, RankableItem[]>();
  items.forEach((item, index) => {
    const root = find(index);
    const members = groupsByRoot.get(root) ?? [];
    members.push(item);
    groupsByRoot.set(root, members);
  });

  return Array.from(groupsByRoot.values()).map((members) => {
    const representative = pickRepresentative(members, sourcePriority);
    const linkageKeys = [...new Set(members.flatMap(getLinkageKeys))].sort();
    const groupId =
      linkageKeys[0] !== undefined
        ? `source:${linkageKeys.join('|')}`
        : `media:${representative.type}:${representative.id}`;

    return {
      groupId,
      representative,
      members,
    };
  });
}

export function rankTopListItems(
  items: RankableItem[],
  limit: number,
  sourcePriority: RatingSource[] = ['goodreads', 'hardcover'],
): RankedTopListItem[] {
  const ranked = items
    .map((item) => {
      const preferred = resolvePreferredRating(item, sourcePriority);
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
    .filter((item): item is RankedTopListItem => item !== null);

  return ranked
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

export function rankMostVotedItems(
  items: RankableItem[],
  limit: number,
  sourcePriority: RatingSource[] = ['goodreads', 'hardcover'],
): RankedTopListItem[] {
  const ranked = items
    .map((item) => {
      const preferred = resolvePreferredRating(item, sourcePriority);
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
    .filter((item): item is RankedTopListItem => item !== null);

  return ranked
    .sort((a, b) => {
      if (b.ratingsCount !== a.ratingsCount) {
        return b.ratingsCount - a.ratingsCount;
      }
      if (b.weightedScore !== a.weightedScore) {
        return b.weightedScore - a.weightedScore;
      }
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}
