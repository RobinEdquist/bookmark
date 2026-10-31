import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { api } from '../helpers/api.helper';
import { getSharedAdmin, type TestUser } from '../helpers/auth.helper';

interface NamedRef {
  id: string;
  name: string;
}
interface SeriesListItem {
  id: string;
  title: string;
  startYear: number | null;
  mainCharacters: NamedRef[];
}
interface CharacterListItem extends NamedRef {
  seriesCount: number;
  coverUrl: string | null;
}
interface CharacterDetail extends NamedRef {
  soloSeries: SeriesListItem[];
  teamUps: SeriesListItem[];
  collections: { id: string; name: string; seriesCount: number }[];
}

/**
 * Main characters on comic series and the character endpoints, against real
 * Postgres. Every name carries a per-run suffix and every row is deleted in
 * afterAll, because the library is shared with the other e2e workers.
 */
describe('Comic main characters (e2e)', () => {
  const run = randomUUID().slice(0, 8);
  const name = (base: string) => `${base} ${run}`;
  let db: Pool;
  let admin: TestUser;
  const seriesIds: string[] = [];
  const collectionIds: string[] = [];

  async function createSeries(title: string, startYear: number | null) {
    const response = await api.post<{ id: string }>(
      '/comics/series',
      { title: name(title), startYear },
      admin.cookie,
    );
    expect(response.status).toBe(201);
    seriesIds.push(response.data.id);
    return response.data.id;
  }

  async function setMainCharacters(seriesId: string, mainCharacters: string[]) {
    return api.patch(
      `/comics/series/${seriesId}`,
      { mainCharacters },
      admin.cookie,
    );
  }

  async function seriesDetail(seriesId: string) {
    const response = await api.get<{
      mainCharacters: NamedRef[];
      manualFields: string[];
    }>(`/comics/series/${seriesId}`, admin.cookie);
    expect(response.status).toBe(200);
    return response.data;
  }

  async function findCharacter(characterName: string) {
    const response = await api.get<{
      characters: CharacterListItem[];
      total: number;
    }>(
      `/comics/characters?search=${encodeURIComponent(characterName)}`,
      admin.cookie,
    );
    expect(response.status).toBe(200);
    return response.data.characters.find((c) => c.name === characterName);
  }

  beforeAll(async () => {
    admin = await getSharedAdmin();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    if (!db) return;
    await db.query('DELETE FROM comic_collections WHERE id = ANY($1::uuid[])', [
      collectionIds,
    ]);
    await db.query('DELETE FROM comic_series WHERE id = ANY($1::uuid[])', [
      seriesIds,
    ]);
    await db.query('DELETE FROM comic_characters WHERE name LIKE $1', [
      `% ${run}`,
    ]);
    await db.end();
  });

  describe('PATCH /comics/series/:id mainCharacters', () => {
    it('sets them in order and records them in manualFields', async () => {
      const seriesId = await createSeries('Wolverine & Captain America', 2004);

      const response = await setMainCharacters(seriesId, [
        name('Wolverine'),
        name('Captain America'),
      ]);
      expect(response.status).toBe(200);

      const detail = await seriesDetail(seriesId);
      expect(detail.mainCharacters.map((c) => c.name)).toEqual([
        name('Wolverine'),
        name('Captain America'),
      ]);
      // Only what was sent is locked; title and the rest stay unlocked
      expect(detail.manualFields).toEqual(['mainCharacters']);
    });

    it('matches an existing character regardless of case', async () => {
      const first = await createSeries('Rogue', 1995);
      const second = await createSeries('Rogue', 2004);

      await setMainCharacters(first, [name('Rogue')]);
      await setMainCharacters(second, [name('rogue')]);

      const [a, b] = await Promise.all([
        seriesDetail(first),
        seriesDetail(second),
      ]);
      expect(b.mainCharacters[0].id).toBe(a.mainCharacters[0].id);
      expect(b.mainCharacters[0].name).toBe(name('Rogue'));
    });

    it('rejects more than three', async () => {
      const seriesId = await createSeries('Too many', 2000);
      const response = await setMainCharacters(seriesId, [
        name('A'),
        name('B'),
        name('C'),
        name('D'),
      ]);
      expect(response.status).toBe(400);
      expect((await seriesDetail(seriesId)).mainCharacters).toEqual([]);
    });

    it('applies concurrent edits of one series one after the other', async () => {
      const seriesId = await createSeries('Contested', 2010);
      const sets = [
        [name('Storm'), name('Cyclops'), name('Jean Grey')],
        [name('Beast'), name('Iceman'), name('Angel')],
      ];

      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          setMainCharacters(seriesId, sets[i % 2]),
        ),
      );
      expect(responses.map((r) => r.status)).toEqual(responses.map(() => 200));

      const names = (await seriesDetail(seriesId)).mainCharacters.map(
        (c) => c.name,
      );
      expect(sets).toContainEqual(names);
    });

    it('clears them with an empty array and drops a character left with no series', async () => {
      const seriesId = await createSeries('Gambit', 1999);
      await setMainCharacters(seriesId, [name('Gambit')]);
      const [gambit] = (await seriesDetail(seriesId)).mainCharacters;

      const response = await setMainCharacters(seriesId, []);
      expect(response.status).toBe(200);

      expect((await seriesDetail(seriesId)).mainCharacters).toEqual([]);
      const lookup = await api.get(
        `/comics/characters/${gambit.id}`,
        admin.cookie,
      );
      expect(lookup.status).toBe(404);
    });
  });

  describe('character endpoints', () => {
    let loganId: string;
    let solo1988: string;
    let solo2003: string;
    let teamUp: string;
    let hidden: string;
    let unrelated: string;

    beforeAll(async () => {
      // Created out of start-year order so the sort is what puts them in order
      solo2003 = await createSeries('Wolverine', 2003);
      teamUp = await createSeries('Wolverine & Hulk', 2002);
      solo1988 = await createSeries('Wolverine', 1988);
      hidden = await createSeries('Wolverine hidden', 1990);
      unrelated = await createSeries('Hulk', 1999);

      for (const id of [solo2003, solo1988, hidden]) {
        expect((await setMainCharacters(id, [name('Logan')])).status).toBe(200);
      }
      await setMainCharacters(teamUp, [name('Logan'), name('Hulk')]);
      await setMainCharacters(unrelated, [name('Hulk')]);
      await db.query(
        "UPDATE comic_series SET status = 'hidden' WHERE id = $1",
        [hidden],
      );

      loganId = (await seriesDetail(solo1988)).mainCharacters[0].id;
    });

    it('filters the series list by main character', async () => {
      const response = await api.get<{
        series: SeriesListItem[];
        total: number;
      }>(`/comics/series?mainCharacterId=${loganId}&limit=100`, admin.cookie);
      expect(response.status).toBe(200);
      expect(response.data.series.map((s) => s.id).sort()).toEqual(
        [solo1988, solo2003, teamUp].sort(),
      );
      const team = response.data.series.find((s) => s.id === teamUp);
      expect(team?.mainCharacters.map((c) => c.name)).toEqual([
        name('Logan'),
        name('Hulk'),
      ]);
    });

    it('rejects a main character filter that is not a uuid', async () => {
      const response = await api.get(
        '/comics/series?mainCharacterId=logan',
        admin.cookie,
      );
      expect(response.status).toBe(400);
    });

    it('lists characters with counts that leave out hidden series', async () => {
      const logan = await findCharacter(name('Logan'));
      expect(logan).toMatchObject({ id: loganId, seriesCount: 3 });

      const hulk = await findCharacter(name('Hulk'));
      expect(hulk?.seriesCount).toBe(2);
    });

    it('returns solo series by start year, team-ups, and collections', async () => {
      const collection = await api.post<{ id: string }>(
        '/comics/collections',
        { name: name('Wolverine solo series') },
        admin.cookie,
      );
      expect(collection.status).toBe(201);
      collectionIds.push(collection.data.id);
      const other = await api.post<{ id: string }>(
        '/comics/collections',
        { name: name('Hulk only') },
        admin.cookie,
      );
      collectionIds.push(other.data.id);
      await api.post(
        `/comics/collections/${collection.data.id}/series`,
        { seriesId: solo1988 },
        admin.cookie,
      );
      await api.post(
        `/comics/collections/${other.data.id}/series`,
        { seriesId: unrelated },
        admin.cookie,
      );

      const response = await api.get<CharacterDetail>(
        `/comics/characters/${loganId}`,
        admin.cookie,
      );

      expect(response.status).toBe(200);
      expect(response.data.name).toBe(name('Logan'));
      expect(response.data.soloSeries.map((s) => s.id)).toEqual([
        solo1988,
        solo2003,
      ]);
      expect(response.data.teamUps.map((s) => s.id)).toEqual([teamUp]);
      expect(response.data.collections.map((c) => c.id)).toEqual([
        collection.data.id,
      ]);

      const collectionDetail = await api.get<{ series: SeriesListItem[] }>(
        `/comics/collections/${collection.data.id}`,
        admin.cookie,
      );
      expect(
        collectionDetail.data.series[0].mainCharacters.map((c) => c.name),
      ).toEqual([name('Logan')]);
    });

    it('returns 404 for an unknown character and 400 for a bad id', async () => {
      expect(
        (await api.get(`/comics/characters/${randomUUID()}`, admin.cookie))
          .status,
      ).toBe(404);
      expect(
        (await api.get('/comics/characters/logan', admin.cookie)).status,
      ).toBe(400);
    });
  });
});
