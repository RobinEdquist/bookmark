import { createHash } from 'crypto';

export function createContentETag(data: Buffer): string {
  const hash = createHash('sha256').update(data).digest('hex');
  return `"${hash}"`;
}

export function matchesIfNoneMatch(
  ifNoneMatch: string | undefined,
  etag: string,
): boolean {
  if (!ifNoneMatch) {
    return false;
  }

  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim())
    .some(
      (candidate) =>
        candidate === '*' || candidate === etag || candidate === `W/${etag}`,
    );
}
