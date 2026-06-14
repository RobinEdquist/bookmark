import {
  normalizeComicTitle,
  scoreVolumeMatch,
  pickAutoMatch,
  isLikelyCollectedEdition,
  rankVolumeCandidate,
} from '../match-confidence';

// ---------------------------------------------------------------------------
// normalizeComicTitle
// ---------------------------------------------------------------------------

describe('normalizeComicTitle', () => {
  it('lowercases and strips a leading "The "', () => {
    expect(normalizeComicTitle('The X-Men')).toBe('x men');
  });

  it('leaves a title with no article unchanged (lowercased)', () => {
    expect(normalizeComicTitle('Saga')).toBe('saga');
  });

  it('strips a leading "A " article', () => {
    expect(normalizeComicTitle('A Tale of Two Cities')).toBe(
      'tale of two cities',
    );
  });

  it('strips a leading "An " article', () => {
    expect(normalizeComicTitle('An Amazing Story')).toBe('amazing story');
  });

  it('normalizes "Amazing Spider-Man, The" the same as "The Amazing Spider-Man"', () => {
    // Both should round-trip to the same normalized string.
    // Rule: strip trailing ", the" as well as leading "the ".
    const a = normalizeComicTitle('Amazing Spider-Man, The');
    const b = normalizeComicTitle('The Amazing Spider-Man');
    expect(a).toBe(b);
  });

  it('strips punctuation (hyphens, commas, apostrophes)', () => {
    // Hyphens become spaces; punctuation removed; whitespace collapsed
    expect(normalizeComicTitle('Batman: Year One')).toBe('batman year one');
  });

  it('removes diacritics (accented characters)', () => {
    // é → e, ñ → n, etc.
    expect(normalizeComicTitle('Légende')).toBe('legende');
  });

  it('collapses multiple internal spaces into one', () => {
    expect(normalizeComicTitle('The   X   Men')).toBe(
      'x   men'.replace(/\s+/g, ' '),
    );
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeComicTitle('')).toBe('');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeComicTitle('   ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// scoreVolumeMatch
// ---------------------------------------------------------------------------

describe('scoreVolumeMatch', () => {
  // Helpers
  const local = (
    title: string,
    startYear: number | null,
    bookCount?: number | null,
  ) => ({ title, startYear, bookCount });

  let candidateIdSeq = 1;
  const candidate = (
    name: string,
    startYear: number | null,
    countOfIssues: number | null,
  ) => ({ id: candidateIdSeq++, name, startYear, countOfIssues });

  // -------------------------------------------------------------------------
  // autoLinkable = true cases
  // -------------------------------------------------------------------------

  it('is autoLinkable when titles match exactly and start years are identical', () => {
    const result = scoreVolumeMatch(
      local('The Amazing Spider-Man', 1963),
      candidate('The Amazing Spider-Man', 1963, 50),
    );
    expect(result.autoLinkable).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('is autoLinkable when titles match and start years differ by exactly 1', () => {
    const result = scoreVolumeMatch(
      local('Daredevil', 1964),
      candidate('Daredevil', 1965, 20),
    );
    expect(result.autoLinkable).toBe(true);
  });

  it('is autoLinkable when titles match and start years differ by 1 in the other direction', () => {
    const result = scoreVolumeMatch(
      local('Daredevil', 1965),
      candidate('Daredevil', 1964, 20),
    );
    expect(result.autoLinkable).toBe(true);
  });

  it('is autoLinkable regardless of leading article differences in title', () => {
    // "Amazing Spider-Man, The" in local ↔ "The Amazing Spider-Man" in candidate
    const result = scoreVolumeMatch(
      local('Amazing Spider-Man, The', 1963),
      candidate('The Amazing Spider-Man', 1963, 50),
    );
    expect(result.autoLinkable).toBe(true);
  });

  // -------------------------------------------------------------------------
  // autoLinkable = false: year mismatch
  // -------------------------------------------------------------------------

  it('is NOT autoLinkable when titles match but start years differ by 5', () => {
    const result = scoreVolumeMatch(
      local('X-Men', 1963),
      candidate('X-Men', 1968, 100),
    );
    expect(result.autoLinkable).toBe(false);
  });

  it('is NOT autoLinkable when titles match but start years differ by 2', () => {
    const result = scoreVolumeMatch(
      local('Hulk', 1962),
      candidate('Hulk', 1964, 10),
    );
    expect(result.autoLinkable).toBe(false);
  });

  // -------------------------------------------------------------------------
  // autoLinkable = false: missing year info
  // -------------------------------------------------------------------------

  it('is NOT autoLinkable when titles match but local startYear is null', () => {
    const result = scoreVolumeMatch(
      local('Saga', null),
      candidate('Saga', 2012, 60),
    );
    expect(result.autoLinkable).toBe(false);
  });

  it('is NOT autoLinkable when titles match but candidate startYear is null', () => {
    const result = scoreVolumeMatch(
      local('Saga', 2012),
      candidate('Saga', null, 60),
    );
    expect(result.autoLinkable).toBe(false);
  });

  it('is NOT autoLinkable when both years are null even if titles match', () => {
    const result = scoreVolumeMatch(
      local('Invincible', null),
      candidate('Invincible', null, 144),
    );
    expect(result.autoLinkable).toBe(false);
  });

  // -------------------------------------------------------------------------
  // autoLinkable = false: title mismatch
  // -------------------------------------------------------------------------

  it('is NOT autoLinkable when normalized titles do not match', () => {
    const result = scoreVolumeMatch(
      local('Batman', 1940),
      candidate('Detective Comics', 1937, 100),
    );
    expect(result.autoLinkable).toBe(false);
    expect(result.score).toBe(0);
  });

  it('returns score 0 when titles do not match', () => {
    const result = scoreVolumeMatch(
      local('Superman', 2000),
      candidate('Batman', 2000, 10),
    );
    expect(result.score).toBe(0);
    expect(result.autoLinkable).toBe(false);
  });

  // -------------------------------------------------------------------------
  // autoLinkable = false: issue-count sanity check
  // -------------------------------------------------------------------------

  it('is NOT autoLinkable when candidate countOfIssues is 0', () => {
    // A volume with zero issues published is not a real candidate
    const result = scoreVolumeMatch(
      local('Thor', 1966),
      candidate('Thor', 1966, 0),
    );
    expect(result.autoLinkable).toBe(false);
  });

  it('is autoLinkable when countOfIssues is null (count unknown, not zero)', () => {
    // Unknown count is acceptable — we just cannot apply the sanity check
    const result = scoreVolumeMatch(
      local('Thor', 1966),
      candidate('Thor', 1966, null),
    );
    expect(result.autoLinkable).toBe(true);
  });

  it('has a higher score for an exact year match than for a ±1 year match', () => {
    const exact = scoreVolumeMatch(
      local('Hulk', 1962),
      candidate('Hulk', 1962, 10),
    );
    const offByOne = scoreVolumeMatch(
      local('Hulk', 1962),
      candidate('Hulk', 1963, 10),
    );
    expect(exact.score).toBeGreaterThan(offByOne.score);
  });

  it('gives a non-zero score when titles match but years are missing (partial evidence)', () => {
    const result = scoreVolumeMatch(
      local('Saga', null),
      candidate('Saga', null, 60),
    );
    // Title matches → some positive score, but NOT autoLinkable
    expect(result.score).toBeGreaterThan(0);
    expect(result.autoLinkable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pickAutoMatch
// ---------------------------------------------------------------------------

describe('pickAutoMatch', () => {
  const local = (title: string, startYear: number | null) => ({
    title,
    startYear,
    bookCount: null as number | null,
  });

  let candidateIdSeq = 1000;
  const candidate = (
    name: string,
    startYear: number | null,
    countOfIssues: number | null = 20,
  ) => ({ id: candidateIdSeq++, name, startYear, countOfIssues });

  it('returns the single autoLinkable candidate when exactly one qualifies', () => {
    const match = candidate('Saga', 2012);
    const result = pickAutoMatch(local('Saga', 2012), [
      candidate('Saga of the Swamp Thing', 1982), // title differs
      match,
      candidate('Saga', 1980, 5), // year off by > 1
    ]);
    expect(result).toBe(match);
  });

  it('returns null when no candidates are autoLinkable', () => {
    const result = pickAutoMatch(local('Invincible', 2003), [
      candidate('Invincible', 1995, 10), // year diff > 1
      candidate('Invincible Iron Man', 2003, 30), // title mismatch
    ]);
    expect(result).toBeNull();
  });

  it('returns null when more than one candidate is autoLinkable (ambiguous)', () => {
    // Two reboots/volumes with the same name and similar year (e.g., both 1963 / 1963)
    const result = pickAutoMatch(local('X-Men', 1963), [
      candidate('X-Men', 1963, 66),
      candidate('X-Men', 1963, 100), // two same-name same-year volumes
    ]);
    expect(result).toBeNull();
  });

  it('returns null for an empty candidates array', () => {
    expect(pickAutoMatch(local('Batman', 1940), [])).toBeNull();
  });

  it('returns null when only candidate has a year mismatch > 1', () => {
    const result = pickAutoMatch(local('Thor', 1966), [
      candidate('Thor', 1973, 30),
    ]);
    expect(result).toBeNull();
  });

  it('correctly handles a reboot-collision scenario — two same-name, different-year volumes', () => {
    // Original run 1963 and reboot 1991 — if local year is 1991, only reboot matches
    const reboot = candidate('X-Factor', 1991, 149);
    const result = pickAutoMatch(local('X-Factor', 1991), [
      candidate('X-Factor', 1986, 149), // year diff = 5 → not autoLinkable
      reboot,
    ]);
    expect(result).toBe(reboot);
  });

  it('returns null when two candidates for the same reboot collision both match', () => {
    // If both volumes within ±1 of local year exist, it is ambiguous → null
    const result = pickAutoMatch(local('X-Factor', 1991), [
      candidate('X-Factor', 1991, 50),
      candidate('X-Factor', 1992, 149), // within ±1
    ]);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isLikelyCollectedEdition
// ---------------------------------------------------------------------------

describe('isLikelyCollectedEdition', () => {
  it.each([
    ['Saga', false],
    ['Saga Compendium One', true],
    ['Saga Deluxe Edition', true],
    ['Batman: The Complete Edition', true],
    ['Saga TPB', true],
    ['X-Men Omnibus', true],
  ])('"%s" -> %s', (name, expected) => {
    expect(isLikelyCollectedEdition(name)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// rankVolumeCandidate
// ---------------------------------------------------------------------------

describe('rankVolumeCandidate', () => {
  const local = { title: 'Saga', startYear: 2012, bookCount: 54 };
  it('ranks the single-issue volume above a same-year collected edition', () => {
    const singles = { id: 1, name: 'Saga', startYear: 2012, countOfIssues: 54 };
    const collected = {
      id: 2,
      name: 'Saga Compendium One',
      startYear: 2012,
      countOfIssues: 1,
    };
    expect(rankVolumeCandidate(local, singles)).toBeGreaterThan(
      rankVolumeCandidate(local, collected),
    );
  });
});

// ---------------------------------------------------------------------------
// scoreVolumeMatch — collected editions are not auto-linkable
// ---------------------------------------------------------------------------

describe('scoreVolumeMatch — collected editions are not auto-linkable', () => {
  it('does not auto-link a volume whose name marks it collected, even on exact title+year', () => {
    const local = { title: 'Saga', startYear: 2012, bookCount: 54 };
    const namedCollected = {
      id: 3,
      name: 'Saga Deluxe Edition',
      startYear: 2012,
      countOfIssues: 3,
    };
    expect(scoreVolumeMatch(local, namedCollected).autoLinkable).toBe(false);
  });
});
