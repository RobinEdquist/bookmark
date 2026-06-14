// Pure helpers for comic collections — kept side-effect free for unit testing.

/** Map an ordered list of series ids to {seriesId, position} rows by index. */
export function reorderPositions(
  seriesIds: string[],
): { seriesId: string; position: number }[] {
  return seriesIds.map((seriesId, position) => ({ seriesId, position }));
}

/** A collection's own cover URL if set, else the first member series' cover. */
export function resolveCollectionCover(
  ownCoverUrl: string | null,
  firstMemberCoverUrl: string | null,
): string | null {
  return ownCoverUrl ?? firstMemberCoverUrl ?? null;
}
