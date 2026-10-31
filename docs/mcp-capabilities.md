# Bookmark MCP

**Status:** agreed, 2026-10-31. Steps 1 and 2 of the build order, the read-only tools and the
writes with dry run and change log, are built, with main characters from step 3. See
[What exists today](#what-exists-today) and [Connecting](#connecting).

An MCP server lets an AI agent (Claude Code, the Claude apps) work on the library: find items
with poor metadata, fix series, fill in metadata, and build collections and reading lists.

The first use case is comics with no metadata. The capabilities are the same for audiobooks,
ebooks and comics.

## Where it lives

A backend module, `apps/backend/src/mcp/`, serving MCP over Streamable HTTP at `/api/mcp`.

- It changes with the API in the same PR and is checked by the same CI.
- It ships in the existing Docker image, so every server gets it on upgrade.
- It is versioned by the git tag like everything else.

### Auth

A `bkmrk_` API key in the `Authorization: Bearer` header, through the existing auth middleware.
Every tool runs as the key's user. Connecting from Claude Code:

```bash
claude mcp add --transport http bookmark https://<server>/api/mcp --header "Authorization: Bearer bkmrk_…"
```

`--transport http` is needed because the server is already running. Claude Code's default
transport, stdio, would try to run the URL as a local command.

The endpoint takes only an API key, not a browser session, so a page open in the browser cannot
drive it.

Remote connectors in the Claude apps sign in with OAuth rather than a pasted key. That comes
later. Better Auth 1.7.5 core has no OAuth provider plugin, so it is a separate project.

### Connecting

1. In Bookmark, open Preferences → API Keys and create a key. The key acts as you, so its
   tools can do what your account can: `library_overview`, `find_items` and every write need
   permission to edit metadata, and ComicVine, Hardcover and Goodreads lookups and links need
   an admin.
2. Add the server to Claude Code. A Docker install serves the API through the web port:

   ```bash
   claude mcp add --transport http bookmark https://<server>/api/mcp --header "Authorization: Bearer bkmrk_…"
   ```

   With `pnpm dev`, point it at the backend directly:

   ```bash
   claude mcp add --transport http bookmark http://localhost:3000/api/mcp --header "Authorization: Bearer bkmrk_…"
   ```

3. Run `claude mcp list`, or `/mcp` inside Claude Code, to check it connected. Start with
   `library_overview`, or run the `/mcp__bookmark__tidy_comics` prompt.

Claude Code asks before each tool that changes the library, unless you allow it. The tools mark
which ones overwrite values, so you can allow the additive ones and keep being asked for the
rest.

The endpoint is stateless Streamable HTTP with JSON responses: each POST is answered in full, and
GET and DELETE return 405.

## Use case: comics with no metadata

A session looks like this:

1. The agent lists comic series that are missing metadata or are not linked to ComicVine.
2. For each, it reads the folder and file names and looks at the covers and first pages.
3. It searches ComicVine and links the match. The sync fills in the metadata.
4. It proposes structure fixes: split junk-drawer series, merge duplicates, rename to
   `Title (Start year)`. It shows a preview. You approve, then it applies.
5. It sets main characters and fills in descriptions and other fields, following your
   preferences (see [Source data and preferences](#source-data-and-preferences)).
6. It builds collections and reading lists.

The target shape is in [Comics library structure](comics-library-structure.md).

## Capabilities

Every tool takes a media type (`audiobook`, `ebook`, `comic`) where it applies. Names are
working names.

### Find work

- `library_overview`: counts per media type, and how many items need attention.
- `find_items`: filter by missing fields, no external link, no series, or text. Paged.

### Inspect

- `get_item`, `get_series`: full metadata, external links, and the path relative to the library
  root. For each field: the value shown, where it comes from (hand-edit, ComicVine, file), and
  what each source has.
- `view_item`: the cover, and for comics the first pages, returned as images so the agent can
  identify what it is looking at.

### Look up

- `search_external`: ComicVine for comics; Hardcover, Audible, iTunes and Goodreads for books.
- `get_match_candidates`: suggested matches for an item or series.

### Fix

- `link_external`: link an item or series to an external record and queue a sync.
- `update_item`, `update_series`: edit metadata fields. Every write locks the field, like a
  hand-edit.
- `unlock_field`: remove the lock so the configured source order applies again.

### Restructure

- `create_series`, `move_items`, `merge_series`.

### Curate

- Collections: create, edit, add series, remove series, reorder.
- Reading lists: create, add items, reorder.
- `set_main_characters` (comics).

### People and genres (admin)

- Merge duplicate people (writers, artists, authors, narrators) and duplicate genres.

### Prompts

MCP prompts are saved workflows that show up as slash commands in Claude Code. A "tidy comics"
prompt would walk the agent through the session above. It takes your preferences as arguments,
for example whether to keep ComicVine's descriptions.

## Source data and preferences

Whether to keep ComicVine's or the file's data, or replace it, is the user's choice, not the
project's. The user tells the agent, in the conversation or through prompt arguments. The MCP
supports both:

- **Keep source data:** the agent sees each field's sources, leaves fields alone, and can
  unlock a field it or someone else edited.
- **Replace it:** any write replaces the shown value and locks the field, so later syncs do not
  change it.

Writes made through the MCP are identified by the change log, so they need no separate marker.

One limit today: a hand-edit is written into the same column as the file's value, so the file's
value is gone afterwards. Unlocking falls back to ComicVine, but cannot bring back the original
file value without re-reading the file.

## What exists today

### MCP tools

Lists are paged and compact; full detail only comes from `get_*`.

#### Read

All marked `readOnlyHint`.

| Tool                   | Comics                                              | Audiobooks                                    | Ebooks                         | Needs                   |
| ---------------------- | --------------------------------------------------- | --------------------------------------------- | ------------------------------ | ----------------------- |
| `library_overview`     | Series, issues, gap counts                          | Items, gap counts                             | Items, gap counts              | Edit metadata           |
| `find_items`           | Series by gap, no link, text                        | By gap, no link, no series, text              | Same as audiobooks             | Edit metadata           |
| `get_series`           | Fields with sources, folder path, issues with paths | Name, description, books (shared with ebooks) | Same as audiobooks             | Signed in               |
| `get_item`             | Issue fields with sources, file path, credits, tags | Fields with sources, folder path, audio files | Fields with sources, file path | Signed in               |
| `view_item`            | Cover and first pages (issue or series)             | Cover                                         | Cover                          | Signed in               |
| `search_external`      | ComicVine volumes                                   | Hardcover, Goodreads, Audible, iTunes         | Hardcover, Goodreads, iTunes   | Admin for CV, HC and GR |
| `get_match_candidates` | Volumes for a series, issues for an issue           | Hardcover, Goodreads, Audible, iTunes         | Hardcover, Goodreads, iTunes   | Admin for CV, HC and GR |
| `list_collections`     | Collections with series counts                      | n/a                                           | n/a                            | Signed in               |
| `get_collection`       | A collection's series, in order                     | n/a                                           | n/a                            | Signed in               |
| `list_changes`         | The change log, by record, user or change set       | Same                                          | Same                           | Edit metadata           |

Every tool also applies the user's tag blacklist: blacklisted items are left out of lists and
refused by id, as in the REST API, and the write tools refuse them too. Explicit content has no
filter of its own anywhere in the app; users hide it by blacklisting a tag.

Images are JPEG, at most 1024 px on the long edge. Comic pages start at page 2 by default, since
page 1 is usually the cover.

#### Write

Every write repeats the guard of its REST route and goes through the same service, so it locks
fields and fires the same events as an edit in the web app. Hints: "overwrites" tools are marked
`destructiveHint`, "adds" tools are not.

| Tool                     | Comics                                                    | Audiobooks and ebooks                         | Dry run | Hint       | Needs         |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------- | ------- | ---------- | ------------- |
| `link_external`          | Series to a ComicVine volume, issues queued; or one issue | Hardcover (by id and search query), Goodreads | No      | Overwrites | Admin         |
| `update_item`            | Issue fields, credits; one or up to 50                    | Fields, authors, narrators, genres            | Yes     | Overwrites | Edit metadata |
| `update_series`          | Series fields, genres, tags; one or up to 50              | Series name                                   | Yes     | Overwrites | Edit metadata |
| `unlock_field`           | Series and issue fields                                   | Fields                                        | No      | Overwrites | Edit metadata |
| `set_main_characters`    | One to three per series                                   | n/a                                           | No      | Overwrites | Edit metadata |
| `create_series`          | Empty series                                              | n/a                                           | No      | Adds       | Edit metadata |
| `move_items`             | Issues to another series                                  | n/a                                           | Yes     | Overwrites | Edit metadata |
| `merge_series`           | Series into a target                                      | n/a                                           | Yes     | Overwrites | Edit metadata |
| `create_collection`      | With its first series                                     | n/a                                           | No      | Adds       | Edit metadata |
| `update_collection`      | Name, sort name, description                              | n/a                                           | Yes     | Overwrites | Edit metadata |
| `add_to_collection`      | Series at the end                                         | n/a                                           | No      | Adds       | Edit metadata |
| `remove_from_collection` | Series out                                                | n/a                                           | No      | Overwrites | Edit metadata |
| `reorder_collection`     | The full order                                            | n/a                                           | No      | Overwrites | Edit metadata |
| `undo_change`            | One change set                                            | Same                                          | Yes     | Overwrites | Edit metadata |

Notes:

- **Linking.** ComicVine and Goodreads take the external id. Hardcover has no lookup by id, so
  `link_external` also takes the search query that found the book and finds it again in the
  first three result pages. A ComicVine series link queues the series' unlinked issues, and
  retries ones left waiting for review or failed, so the sync matches each to an issue of the
  volume. Goodreads links are queued and can take minutes.
- **Unlocking.** `unlock_field` removes a field from `manualFields`; the stored value stays.
  The source order then applies again, so ComicVine's value shows if it is linked and ranked
  first. A hand-edit is written into the same column as the file's value, so a file value it
  replaced only comes back when the file is read again (a rescan of a changed file).
- **Moves and merges** pin each issue to its new series so rescans keep it. A series a move or
  merge leaves empty is deleted, as in the web app. The dry run lists those series, and for a
  merge what each source loses: main characters, collections and its ComicVine volume.
- **Collections** are comic collections. Ebook groups are left alone until they become
  collections (slice 4 of [the comics structure plan](plans/2026-10-31-comics-structure.md)).

#### Prompts

- `tidy_comics`: walks the agent through the session in
  [Use case](#use-case-comics-with-no-metadata). Arguments: `scope` (text to limit it to),
  `descriptions` (`keep` ComicVine's or `replace` them), `fileData` (`keep` or `replace` the
  files' values), `approval` (ask before `each` change, or per `batch`). A preference left out
  makes the agent ask. Claude Code shows it as `/mcp__bookmark__tidy_comics`.

### Change log

Every MCP write is a row in `mcp_change_log`: the user, the tool, the record (type and id), the
field, the value before and after, and the time. Lockable fields store `{ value, locked }`, so the
lock state is restored too. Rows from one tool call share a `changeSetId`.

`undo_change` takes a change set and writes the `before` values back through the same services:

- **Undone:** field edits and unlocks, main characters, issue moves, collection edits,
  membership and order.
- **Skipped:** rows whose value changed again since (unless `force`), created series and
  collections (undoing would mean a delete), external links (unlink in the web app), and issue
  moves whose old series was deleted.
- **Refused:** merges. A merge deletes the emptied sources. Each deleted series is logged in
  full (fields, locks, main characters, collections, ComicVine volume, folder, issue ids), so it
  can be rebuilt by hand with `create_series`, `update_series`, `set_main_characters` and
  `move_items`. The same row is written when a move empties a series.

An undo is itself a change set, so it can be undone. Undoing a move can empty the series the
issues were moved into; that series is deleted and logged like any other.

The log has no web view yet. That is a follow-up.

Left for audiobooks and ebooks:

- `get_series` has no field sources or paths: a book series is a name and a description, shared
  by both media types.
- `view_item` shows no ebook pages.
- `find_items` `noSeries` checks the book's own series rows, not Hardcover's featured series.
- Audible and iTunes candidates search the resolved title and first author only, in the US store.
- `update_item` does not set a book's series or tags, and `update_series` only renames a book
  series. There is no series merge or move for books, and no collections.

### Capabilities

| Capability                  | Comics                          | Audiobooks                            | Ebooks                               |
| --------------------------- | ------------------------------- | ------------------------------------- | ------------------------------------ |
| Find items missing metadata | Yes (metadata-gaps, per series) | Yes (metadata-gaps)                   | Yes (metadata-gaps)                  |
| Inspect item and series     | Yes                             | Yes                                   | Yes                                  |
| Cover image                 | Yes                             | Yes                                   | Yes                                  |
| Page images                 | Yes (OPDS page route, MCP)      | n/a                                   | n/a                                  |
| External search and link    | ComicVine, admin only           | Hardcover, Audible, iTunes, Goodreads | Hardcover, Goodreads                 |
| Edit metadata               | Yes                             | Yes                                   | Yes                                  |
| Unlock a hand-edited field  | MCP only                        | MCP only                              | MCP only                             |
| Folder path                 | MCP only, relative to the root  | MCP only, relative to the root        | MCP only, relative to the root       |
| Create series, move items   | Yes                             | Yes, through the book's series field  | Yes, through the book's series field |
| Merge series                | Yes                             | **Missing** (rename only)             | **Missing** (rename only)            |
| Collections                 | Yes                             | **Missing**                           | Ebook groups, to be renamed          |
| Reading lists               | **Missing**                     | **Missing**                           | **Missing**                          |
| Main characters             | Yes                             | n/a                                   | n/a                                  |
| Merge genres                | Yes, admin                      | Yes, admin                            | Yes, admin                           |
| Merge people                | Yes, admin                      | Yes, admin                            | Yes, admin                           |
| Change log and undo         | MCP writes                      | MCP writes                            | MCP writes                           |

Comic gaps in the worklist are per series: cover (the series' or its first issue's),
description, main characters, publisher, start year, ComicVine link, and two roll-ups of the
issues, a missing number (numbered runs only) and a missing cover date. Like the book gaps, a
field counts as present when any source the metadata priority consults has it, ComicVine
included.

## Safety

- **Tool hints.** Read tools are marked read-only. Merge, move and every tool that overwrites
  values are marked destructive, so Claude asks before running them. Purely additive tools
  (create a series or collection, add to a collection) are not.
- **Dry run.** Merge, move and the update tools (one id or up to 50) take `dryRun: true` and
  return the result without applying it.
- **Change log.** Every write through the MCP is recorded with the user, the item, and the
  before and after values, so the work can be reviewed and undone. See
  [Change log](#change-log) for what undo covers.
- **No deletes.** There is no tool to delete items, series or collections. A move or merge
  that empties a series deletes it, as in the web app; the change log keeps it in full.
- **Permissions.** Tools call services directly, so they skip the controller guards. Each tool
  repeats its guard: edit metadata for edits, admin for ComicVine and for people and genre
  merges. Each tool gets a test that a user without the permission is refused, and `/mcp` is
  registered in `apps/backend/test/auth/endpoint-definitions.ts`.
- **Paths.** The MCP shows paths relative to the library root, never the server's full path.
  The public API keeps hiding paths.
- **Compact output.** Lists are paged and summarised. Full detail only comes from `get_*`, so a
  large library does not fill the agent's context.

## Server work

1. ~~Fix people merge so it moves comic creator credits.~~ Done.
2. ~~Comics in the metadata-gaps worklist.~~ Done.
3. ~~The change log.~~ Done, MCP writes only. A web view of it is a follow-up.
4. ~~Unlocking a hand-edited field.~~ Done in the services and the MCP; no REST route or web
   control yet. Optionally keep the file's value when a field is hand-edited, so unlocking can
   bring it back.
5. ~~Main characters on comic series.~~ Done.
6. Reading lists, all three media types.
7. Series merge for audiobooks and ebooks.
8. Collections with one shape for all three media types (ebook groups renamed, audiobooks new).
9. OAuth for the Claude apps' remote connectors.

## Build order

1. **Read-only:** `library_overview`, `find_items` (needs comics in metadata-gaps), `get_*`,
   `view_item`, `search_external`, `get_match_candidates`. Built.
2. **Writes, with dry run and change log:** `link_external`, `update_*`, `unlock_field`,
   `create_series`, `move_items`, `merge_series`, collections. Built, with `list_changes`,
   `undo_change` and the `tidy_comics` prompt.
3. **New concepts:** main characters (built: `set_main_characters`), reading lists.
4. **Symmetry:** series merge for audiobooks and ebooks, collections for audiobooks.
5. **OAuth.**

## Decisions

Made 2026-10-31.

1. **Agent writes lock fields**, the same as hand-edits (`manualFields`). `unlock_field` undoes
   that.
2. **The MCP sees folder paths** relative to the library root. For comics with no metadata, the
   folder name is often the best clue.
3. **Source data is the user's preference.** The MCP can both keep and replace ComicVine and
   file data. See [Source data and preferences](#source-data-and-preferences).
4. **ComicVine stays admin-only**, in the MCP as in the web app. It runs on the admin's API key
   and rate limit.
