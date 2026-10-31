// apps/backend/src/comics/comic-main-characters.ts
import { asc, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import type { ComicNamedRefDto } from './dto/comics-response.dto';

/** A series is about one to three characters or teams. */
export const MAX_MAIN_CHARACTERS = 3;

/**
 * Trim names, drop blanks, and drop case-insensitive duplicates, keeping the
 * first spelling and the order given.
 */
export function normalizeMainCharacterNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/**
 * Split a character's series: solo series have that character as their only
 * main character, team-ups have several. Order is kept.
 */
export function splitSoloAndTeamUps<T extends { mainCharacters: unknown[] }>(
  series: T[],
): { soloSeries: T[]; teamUps: T[] } {
  return {
    soloSeries: series.filter((s) => s.mainCharacters.length === 1),
    teamUps: series.filter((s) => s.mainCharacters.length > 1),
  };
}

/** Main characters per series id, in display order. */
export async function loadMainCharacters(
  db: Pick<NodePgDatabase<typeof schema>, 'select'>,
  seriesIds: string[],
): Promise<Map<string, ComicNamedRefDto[]>> {
  const bySeries = new Map<string, ComicNamedRefDto[]>();
  if (seriesIds.length === 0) return bySeries;
  const rows = await db
    .select({
      seriesId: schema.comicSeriesMainCharacters.seriesId,
      id: schema.comicCharacters.id,
      name: schema.comicCharacters.name,
    })
    .from(schema.comicSeriesMainCharacters)
    .innerJoin(
      schema.comicCharacters,
      eq(
        schema.comicSeriesMainCharacters.characterId,
        schema.comicCharacters.id,
      ),
    )
    .where(inArray(schema.comicSeriesMainCharacters.seriesId, seriesIds))
    .orderBy(asc(schema.comicSeriesMainCharacters.position));
  for (const row of rows) {
    const list = bySeries.get(row.seriesId) ?? [];
    list.push({ id: row.id, name: row.name });
    bySeries.set(row.seriesId, list);
  }
  return bySeries;
}
