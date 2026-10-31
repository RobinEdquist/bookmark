import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import { ComicsService } from './comics.service';
import { ComicsCollectionsService } from './comics-collections.service';
import { splitSoloAndTeamUps } from './comic-main-characters';
import {
  ComicCharacterDetailDto,
  ComicCharacterListResponseDto,
} from './dto/comics-response.dto';

type Db = NodePgDatabase<typeof schema>;

interface ListCharactersFilters {
  search?: string;
  limit?: number;
  offset?: number;
}

// Upper bound for one character's series and collections on its page. A main
// character is set by hand on one to three per series, so this is never
// reached in a real library; it only keeps the query bounded.
const CHARACTER_PAGE_LIMIT = 1000;

/** Main characters as a way into the comics library. */
@Injectable()
export class ComicsCharactersService {
  constructor(
    @Inject(DATABASE_CONNECTION) private db: Db,
    private comicsService: ComicsService,
    private collectionsService: ComicsCollectionsService,
  ) {}

  /**
   * Characters that are a main character of at least one series the user can
   * see, by name, with a count of those series and a cover.
   */
  async findAll(
    filters: ListCharactersFilters,
    userId: string,
  ): Promise<ComicCharacterListResponseDto> {
    const { search, limit = 50, offset = 0 } = filters;
    const conditions = this.comicsService.visibleSeriesConditions(userId);
    if (search) {
      conditions.push(ilike(schema.comicCharacters.name, `%${search}%`));
    }
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: schema.comicCharacters.id,
          name: schema.comicCharacters.name,
          seriesCount: sql<number>`count(*)`,
        })
        .from(schema.comicCharacters)
        .innerJoin(
          schema.comicSeriesMainCharacters,
          eq(
            schema.comicSeriesMainCharacters.characterId,
            schema.comicCharacters.id,
          ),
        )
        .innerJoin(
          schema.comicSeries,
          eq(schema.comicSeries.id, schema.comicSeriesMainCharacters.seriesId),
        )
        .where(where)
        .groupBy(schema.comicCharacters.id)
        .orderBy(
          asc(sql`lower(${schema.comicCharacters.name})`),
          asc(schema.comicCharacters.id),
        )
        .limit(limit)
        .offset(offset),
      this.db
        .select({
          total: sql<number>`count(distinct ${schema.comicCharacters.id})`,
        })
        .from(schema.comicCharacters)
        .innerJoin(
          schema.comicSeriesMainCharacters,
          eq(
            schema.comicSeriesMainCharacters.characterId,
            schema.comicCharacters.id,
          ),
        )
        .innerJoin(
          schema.comicSeries,
          eq(schema.comicSeries.id, schema.comicSeriesMainCharacters.seriesId),
        )
        .where(where),
    ]);

    const covers = await this.coversFor(
      rows.map((r) => r.id),
      userId,
    );

    return {
      characters: rows.map((row) => ({
        id: row.id,
        name: row.name,
        seriesCount: Number(row.seriesCount),
        coverUrl: covers.get(row.id) ?? null,
      })),
      total: Number(total),
    };
  }

  /**
   * One cover per character: its earliest solo series, else the series with
   * the fewest main characters, earliest first.
   */
  private async coversFor(
    characterIds: string[],
    userId: string,
  ): Promise<Map<string, string | null>> {
    const covers = new Map<string, string | null>();
    if (characterIds.length === 0) return covers;

    const picks = await this.db
      .selectDistinctOn([schema.comicSeriesMainCharacters.characterId], {
        characterId: schema.comicSeriesMainCharacters.characterId,
        series: schema.comicSeries,
      })
      .from(schema.comicSeriesMainCharacters)
      .innerJoin(
        schema.comicSeries,
        eq(schema.comicSeries.id, schema.comicSeriesMainCharacters.seriesId),
      )
      .where(
        and(
          inArray(schema.comicSeriesMainCharacters.characterId, characterIds),
          ...this.comicsService.visibleSeriesConditions(userId),
        ),
      )
      .orderBy(
        schema.comicSeriesMainCharacters.characterId,
        sql`(SELECT count(*) FROM comic_series_main_characters others WHERE others.series_id = ${schema.comicSeries.id})`,
        sql`${schema.comicSeries.startYear} ASC NULLS LAST`,
        asc(schema.comicSeries.createdAt),
      );

    const seriesCovers = await this.comicsService.seriesCoverUrls(
      picks.map((p) => p.series),
    );
    for (const pick of picks) {
      covers.set(pick.characterId, seriesCovers.get(pick.series.id) ?? null);
    }
    return covers;
  }

  /**
   * A character page: solo series and team-ups by start year, and the
   * collections that contain any of them. Only series the user can see.
   */
  async findOne(id: string, userId: string): Promise<ComicCharacterDetailDto> {
    const [character] = await this.db
      .select({
        id: schema.comicCharacters.id,
        name: schema.comicCharacters.name,
      })
      .from(schema.comicCharacters)
      .where(eq(schema.comicCharacters.id, id))
      .limit(1);
    if (!character) throw new NotFoundException('Comic character not found');

    const { series } = await this.comicsService.findAllSeries(
      {
        mainCharacterId: id,
        sortBy: 'startYear',
        sortOrder: 'asc',
        limit: CHARACTER_PAGE_LIMIT,
      },
      userId,
    );
    const { soloSeries, teamUps } = splitSoloAndTeamUps(series);
    const { collections } = await this.collectionsService.findAll({
      seriesIds: series.map((s) => s.id),
      limit: CHARACTER_PAGE_LIMIT,
    });

    return {
      id: character.id,
      name: character.name,
      soloSeries,
      teamUps,
      collections,
    };
  }
}
