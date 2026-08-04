/**
 * Minimal semver comparison, scoped deliberately narrowly.
 *
 * Both sides of the only comparison we make are plain `X.Y.Z` triples:
 *  - ours is `VersionResponseDto.baseVersion`, already stripped of any
 *    prerelease/build suffix
 *  - theirs is a GitHub release tag, and `/releases/latest` excludes drafts and
 *    prereleases by definition
 *
 * so full prerelease-precedence rules would be dead code. Anything that does not
 * parse as a numeric triple returns null and the caller reports no update —
 * failing closed, because a wrong "update available" nag is worse than a missed
 * one.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Leading numeric components of a version, with an optional `v` prefix. */
const NUMERIC_PREFIX = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/;

export function parseVersion(
  raw: string | null | undefined,
): ParsedVersion | null {
  if (!raw) return null;
  const match = NUMERIC_PREFIX.exec(raw.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    // Pad missing components so a `v1` or `v1.2` tag still compares sanely.
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
}

/**
 * Returns true when `candidate` is strictly newer than `current`, and false when
 * it is equal, older, or either side is unparseable.
 */
export function isNewerVersion(
  candidate: string | null | undefined,
  current: string | null | undefined,
): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;

  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}
