# Comics structure: implementation plan

Builds [Comics library structure](../comics-library-structure.md). Each slice is one PR-sized
change that passes the CI gate on its own. Slices 1 and 2 are built on
`feature/comics-structure`; the rest are planned here.

## 1. Main characters on series

**Schema.** Two new tables:

- `comic_characters`: `id`, `name`, timestamps. Unique on `lower(name)`. One row is a character
  or a team; the name says which.
- `comic_series_main_characters`: `series_id`, `character_id`, `position`. Primary key
  `(series_id, character_id)`, index on `character_id`. Both foreign keys cascade.

Why this shape:

- A character needs an id so its page has a stable URL and the series filter, the shelves
  (slice 7), reading lists (slice 3) and the MCP's `set_main_characters` all point at the same
  record. A JSON array of names on `comic_series` would have none of that, and counting or
  filtering by character would need JSON scans.
- `comic_series_tags` is taken: it links series to user tags, which drive the blacklist.
- Issue character tags (`comic_book_metadata_tags`) are plain strings for every appearance. They
  stay separate, so main characters are never derived from them.
- `position` keeps the 1–3 entries in the order they were set ("Wolverine & Captain America").
- No character/team flag yet. Nothing in slices 1–7 needs it, and a nullable column can be added
  later without a data migration.

**API.**

- `PATCH /comics/series/:id` takes `mainCharacters: string[]` (names, at most 3). Names are
  trimmed and de-duplicated case-insensitively, then matched to existing characters by
  `lower(name)` or created. An empty array clears them. The replace runs in a transaction that
  locks the series row, so concurrent edits cannot leave more than three. `mainCharacters` is
  added to `manualFields`. A character left with no series is deleted.
- Series list items and series detail return `mainCharacters: { id, name }[]` in position order.
- `GET /comics/series?mainCharacterId=` filters by main character.

**Files.** `apps/backend/src/comics/schema.ts`, `comic-main-characters.ts` (new),
`comics.service.ts`, `dto/comics.dto.ts`, `dto/comics-response.dto.ts`, new migration in
`apps/backend/drizzle/migrations/`, tests in `src/comics/__tests__/`,
`apps/backend/test/comics/comic-characters.e2e-spec.ts` (new). Web:
`apps/web/lib/use-comics.ts`, `components/comics/edit-comic-series-dialog.tsx`,
`app/(authenticated)/comics/[id]/page.tsx`, `packages/ui/src/components/ui/creatable-combobox.tsx`
(`maxItems`, `onInputChange`), `apps/web/messages/{en,sv}/comics.json`.

## 2. Characters view and character page

**API.**

- `GET /comics/characters?search=&limit=&offset=`: characters with at least one visible series,
  sorted by name, with `seriesCount` and a cover taken from their first solo series (by start
  year), else their first series. Hidden and blacklisted series are not counted.
- `GET /comics/characters/:id`: `soloSeries` (the character is the only main character, by start
  year), `teamUps` (several main characters, by start year), and `collections` that contain any
  of those series. Events wait for slice 3.

**Files.** `apps/backend/src/comics/comics-characters.service.ts` (new), `comics.controller.ts`,
`comics.module.ts`, `comics-collections.service.ts` (internal `seriesIds` filter),
`comics.service.ts` (shared visibility condition and cover lookup),
`dto/comic-character.dto.ts` (new), `dto/comics-response.dto.ts`,
`apps/backend/test/auth/endpoint-definitions.ts`. Web: `lib/use-comic-characters.ts` (new),
`lib/query-keys.ts`, `components/comics/comic-characters-view.tsx`,
`comic-character-card.tsx`, `comic-character-grid.tsx` (new),
`app/(authenticated)/comics/page.tsx` (Characters tab),
`app/(authenticated)/comics/characters/[id]/page.tsx` (new), messages.

## 3. Reading lists

Shared, ordered lists of items across series, for all three media types. One table for the list
(`reading_lists`: name, sort name, description, cover, media type) and one for entries
(`reading_list_items`: list id, media type, item id, position, note). Item ids point at
`comic_books`, `ebooks` or `audiobooks`, so the item reference is checked in the service, not by
a foreign key; deleting an item removes its entries in the same code path. Edited with
`edit_metadata`. The character page gains an Events section: reading lists with any issue from
the character's series.

**Files.** `apps/backend/src/reading-lists/` (new module: schema, service, controller, DTOs,
tests), deletes in `comics.service.ts`, `ebooks.service.ts`, `audiobooks.service.ts`,
`test/auth/endpoint-definitions.ts`, e2e spec. Web: `lib/use-reading-lists.ts`,
`app/(authenticated)/reading-lists/` (list and detail pages), "Add to reading list" on comic book,
ebook and audiobook pages, `comics-characters.service.ts` and the character page, messages.

## 4. Collections, one shape for all three media types

Rename `ebook_groups` / `ebook_group_members` to `ebook_collections` / `ebook_collection_members`
and `/ebooks/groups` to `/ebooks/collections`. Members become "series or item" with an optional
`note`, replacing the free-text `role`. Comic collections get `note`. Audiobook collections are
new with the same tables and endpoints. A shared helper holds ordering and cover logic, which
today lives in both `collections.helpers.ts` and `ebook-groups.helpers.ts`.

**Files.** `apps/backend/src/ebooks/schema.ts`, `ebook-groups.*` → `ebook-collections.*`,
`dto/ebook-group*.dto.ts`, `src/comics/schema.ts`, `comics-collections.service.ts`,
`dto/comic-collection.dto.ts`, `src/audiobooks/` (new collections service/controller/schema),
migration, `test/auth/endpoint-definitions.ts`, `test/ebooks/ebook-groups.e2e-spec.ts` (renamed).
Web: `components/ebooks/*group*` → `*collection*`, `app/(authenticated)/ebooks/groups` →
`ebooks/collections`, `lib/use-ebook-groups.ts`, new audiobook collection components, messages.

## 5. Publisher, event and creator pages

- Publisher: series by publisher, grouped by imprint. `GET /comics/publishers/:name`.
- Event: a story arc with its series and, when one exists, the reading list. Built on issue
  `story_arc` tags. `GET /comics/events`, `GET /comics/events/:name`.
- Creator: a person's comic credits grouped into runs (consecutive issues of one series in one
  role). `GET /comics/creators/:personId`.

Each gets a tab on `/comics` and a page. **Files.** `comics.controller.ts`, a new
`comics-browse.service.ts`, DTOs, endpoint registry, e2e spec. Web: `/comics/publishers/[name]`,
`/comics/events/[name]`, `/comics/creators/[id]`, tab views, messages.

## 6. Comics in the metadata-gaps worklist

Add `comic` to the media types in `metadata-gaps`: series with no ComicVine link, no description,
no publisher, no start year, no main characters, and issues with no cover date or number.
**Built** on `feature/mcp-read-only`, with the MCP's read-only tools. Issue gaps roll up to the
series (`issueNumbers`, `issueCoverDates`), and a series cover falls back to its first issue's.
**Files.** `apps/backend/src/metadata-gaps/gap-definitions.ts`, `metadata-gaps.service.ts`,
its DTOs and specs; web `components/metadata-gaps/*`, `lib/use-metadata-gaps.ts`, messages.

## 7. Comics home with shelves

`/comics` opens on a home view: continue reading, then one shelf per main character and per
collection (characters with the most series first), then the browse tabs. The Series tab keeps
today's grid. A small `GET /comics/home` returns the shelves in one call. **Files.**
`comics.controller.ts`, `comics-characters.service.ts`, DTO, endpoint registry; web
`app/(authenticated)/comics/page.tsx`, `components/comics/comics-home.tsx` (new),
`components/home/horizontal-scroll-row.tsx` (reused), messages.

## Notes from building

- Comic series and book edits locked every field the DTO declares, not only the fields sent: the
  validation pipe builds a DTO instance whose unset fields are own properties holding
  `undefined`, and `Object.keys` counted them. Setting main characters would have locked title,
  description and the rest against ComicVine. Fixed for `PATCH /comics/series/:id`,
  `/comics/books/:id` and `/comics/books/batch` with `definedFields`
  (`apps/backend/src/common/utils/defined-fields.util.ts`). Ebooks and audiobooks check each
  field against `undefined` and were not affected. Rows already locked this way stay locked
  until `unlock_field` exists.
- Merging series keeps only the target's main characters. That suits merging junk-drawer series
  into a real one; if it turns out wrong, merge could add the sources' characters up to three.
- Characters have no rename or merge yet. The MCP's `set_main_characters` only needs set by name;
  rename and merge belong with the people and genre admin tools.
