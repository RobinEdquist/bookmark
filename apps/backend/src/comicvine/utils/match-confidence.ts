// ---------------------------------------------------------------------------
// ComicVine match-confidence utilities
// ---------------------------------------------------------------------------
// Pure functions — no DB, no HTTP, no NestJS dependencies.
//
// Safety rule: NEVER "link the first search hit." Auto-link is permitted only
// when confidence is HIGH:
//   - Normalized titles are identical, AND
//   - Both start-years are known AND agree within ±1, AND
//   - Candidate has at least 1 issue published (sanity check).
//
// Anything ambiguous (year mismatch >1, missing year, multiple same-name
// candidates) must NOT auto-link — it goes to the needs-review queue.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// normalizeComicTitle
// ---------------------------------------------------------------------------
// Transform a raw comic title into a canonical form for comparison:
//   1. Decode Unicode / decompose diacritics, then strip combining marks
//      so "é" → "e", "ñ" → "n", etc.
//   2. Lowercase.
//   3. Strip a trailing ", the" / ", a" / ", an" (e.g. "Spider-Man, The").
//   4. Strip a leading "the " / "a " / "an " article.
//   5. Remove all remaining punctuation characters (keep only letters/digits
//      and whitespace — hyphens become spaces via replacement with " ").
//   6. Collapse consecutive whitespace and trim.
// ---------------------------------------------------------------------------

const LEADING_ARTICLES = /^(the|a|an)\s+/;
const TRAILING_ARTICLES = /,\s*(the|a|an)$/;

export function normalizeComicTitle(s: string): string {
  if (!s || !s.trim()) return '';

  // 1. Decompose diacritics and strip combining marks (Unicode NFD + remove Mn category)
  let result = s.normalize('NFD').replace(/\p{Mn}/gu, '');

  // 2. Lowercase
  result = result.toLowerCase();

  // 3. Strip trailing ", the" / ", a" / ", an"
  result = result.replace(TRAILING_ARTICLES, '');

  // 4. Strip leading article ("the ", "a ", "an ")
  result = result.replace(LEADING_ARTICLES, '');

  // 5. Replace hyphens/dashes with a space, then remove all remaining
  //    punctuation (anything that is not a word character or whitespace).
  result = result
    .replace(/[-–—]/g, ' ')
    .replace(/[^\w\s]/g, '')
    // \w includes underscore; strip that too for cleanliness
    .replace(/_/g, ' ');

  // 6. Collapse whitespace and trim
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

// ---------------------------------------------------------------------------
// scoreVolumeMatch input/output types
// ---------------------------------------------------------------------------

export interface LocalSeries {
  title: string;
  startYear: number | null;
  bookCount?: number | null;
}

export interface CandidateVolume {
  name: string;
  startYear: number | null;
  countOfIssues: number | null;
}

export interface VolumeMatchResult {
  /** Numeric confidence score (higher is more confident). 0 means no match. */
  score: number;
  /** True only when confidence is high enough for automatic linking. */
  autoLinkable: boolean;
}

// ---------------------------------------------------------------------------
// scoreVolumeMatch
// ---------------------------------------------------------------------------
// Conservative scoring logic:
//
//   Title mismatch           → score 0, autoLinkable false (short-circuit)
//   Title match only         → score 10, autoLinkable false (insufficient evidence)
//   Title + exact year       → score 100, autoLinkable true  (unless sanity fails)
//   Title + year ±1          → score 80,  autoLinkable true  (unless sanity fails)
//   Title + year diff 2–1    → score 5,   autoLinkable false
//   Title + year diff > 1    → score 5,   autoLinkable false
//   Title + one/both years   → score 10,  autoLinkable false
//     unknown
//
// Sanity check: if countOfIssues === 0 → downgrade autoLinkable to false
//   (a volume with zero issues is not a real publication).
//   If countOfIssues is null the sanity check is skipped (count unknown).
// ---------------------------------------------------------------------------

const SCORE_TITLE_ONLY = 10;
const SCORE_YEAR_EXACT = 100;
const SCORE_YEAR_OFF_BY_ONE = 80;
const SCORE_YEAR_MISMATCH = 5;

export function scoreVolumeMatch(
  local: LocalSeries,
  candidate: CandidateVolume,
): VolumeMatchResult {
  // ------- 1. Title must normalize-equal -------
  const normalLocal = normalizeComicTitle(local.title);
  const normalCandidate = normalizeComicTitle(candidate.name);

  if (normalLocal !== normalCandidate) {
    return { score: 0, autoLinkable: false };
  }

  // ------- 2. Year comparison -------
  const bothYearsKnown =
    local.startYear !== null &&
    local.startYear !== undefined &&
    candidate.startYear !== null &&
    candidate.startYear !== undefined;

  let score: number;
  let autoLinkable: boolean;

  if (!bothYearsKnown) {
    // Title matches but we cannot verify year → partial evidence only
    score = SCORE_TITLE_ONLY;
    autoLinkable = false;
  } else {
    const diff = Math.abs(local.startYear! - candidate.startYear!);

    if (diff === 0) {
      score = SCORE_YEAR_EXACT;
      autoLinkable = true;
    } else if (diff === 1) {
      score = SCORE_YEAR_OFF_BY_ONE;
      autoLinkable = true;
    } else {
      // Year mismatch beyond tolerance → never auto-link
      score = SCORE_YEAR_MISMATCH;
      autoLinkable = false;
    }
  }

  // ------- 3. Issue-count sanity check -------
  // countOfIssues === 0 means the volume exists in the DB but has no issues
  // published — that is a data-quality red flag; do not auto-link.
  // null means the count is simply unknown (acceptable).
  if (autoLinkable && candidate.countOfIssues === 0) {
    autoLinkable = false;
  }

  return { score, autoLinkable };
}

// ---------------------------------------------------------------------------
// pickAutoMatch
// ---------------------------------------------------------------------------
// Return the single auto-linkable candidate, or null when:
//   - zero candidates are auto-linkable  (no match → needs-review or skip)
//   - more than one candidate is auto-linkable  (ambiguous → needs-review)
//
// Comic volume names collide constantly across publisher reboots (multiple
// "X-Men" volumes from different decades), so we must be conservative: if two
// volumes both score high enough, we cannot safely pick one automatically.
// ---------------------------------------------------------------------------

export function pickAutoMatch(
  local: LocalSeries,
  candidates: CandidateVolume[],
): CandidateVolume | null {
  const autoLinkable = candidates.filter(
    (c) => scoreVolumeMatch(local, c).autoLinkable,
  );

  if (autoLinkable.length === 1) {
    return autoLinkable[0];
  }

  // 0 or ≥ 2 → cannot auto-link
  return null;
}
