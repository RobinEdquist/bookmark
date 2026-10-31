# Comics library structure

**Status:** agreed, 2026-10-31. Nothing here is built yet.

How a comics library should be organised so a few hundred series stay browsable. The
[MCP](mcp-capabilities.md) is the tool that tidies an existing library into this shape.

## Problem

The comics page is one grid of series, sorted by recently added, with a second view for
collections. Wolverine solo series, Wolverine team-ups, Rogue, Batman and Boom! titles sit
side by side with nothing to group them.

Some "series" are not series. They come from the folder layout of downloaded packs:

| Series today                             | What it actually is                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `Limited Series & One-Shots (1988-2014)` | 19 books from many unrelated series                                    |
| `Annuals 01-10 (1995-2012)`              | Annuals from several different volumes                                 |
| `06 Wolverine v1 300-317 (2012-2013)`    | One volume, named with the pack's reading-order prefix and issue range |
| `04 Wolverine v4 01-20 (2010-2012)`      | Same                                                                   |

`Rogue (1995)` and `Rogue (2004)` are already named the way collectors name series.

## Principle

Two fixed levels, series and issue. Everything else is either a way in or a hand-made group.

Comics do not fit a tree. `Wolverine & Captain America` belongs to both characters.
`Fear Itself: Wolverine` belongs to Wolverine and to the Fear Itself event. A tree forces one
parent, so items land in the wrong place or in junk drawers. Ways in let one series show up
everywhere it belongs.

## Fixed levels

### Series

- One run of a title from its #1, named `Title (Start year)`. A relaunch that restarts at #1 is
  a new series. This matches a ComicVine volume.
- Each one-shot and each annual run is its own series, matching its ComicVine volume. Komga
  does the same for one-shots and groups related series with collections and read lists.
- Collected editions (TPB, omnibus, compendium) are their own series. Their books carry
  `format`, and `collects` says which issues they reprint.
- The issue range is data, not part of the name. The UI shows `#1–20` from the issues.

### Issue

Number, format, cover date, summary, creators with roles, and tags (character, team, story arc,
location).

## Ways in

| Way in               | Set on | Today                                                                       | Needed                          |
| -------------------- | ------ | --------------------------------------------------------------------------- | ------------------------------- |
| Main character, team | Series | Missing                                                                     | New field, 1–3 per series       |
| Publisher, imprint   | Series | Fields exist; publisher filter on the grid                                  | Publisher index page            |
| Event, story arc     | Issue  | Story-arc tags from ComicInfo.xml; chips on the series page filter the grid | Event index page, reading lists |
| Creator              | Issue  | Creators with roles exist                                                   | Creator page (writer runs)      |
| Era                  | Series | Sort by start year exists                                                   | Nothing                         |
| Genre, tag           | Series | Exist                                                                       | Nothing                         |

### Why main character is a series field

Issue character tags list everyone who appears in the issue. The character chip on a series
page filters the grid to every series with any issue tagged with that character, so a
Wolverine page built on those tags would list every series he cameos in.

Main characters are the one to three characters a series is about. They are set by hand or by
the agent, never derived from appearances.

## Hand-made groups

### Collections

An ordered set of series, shared across the library. Examples: "Wolverine solo series",
"Batman by Loeb & Sale".

Collections have the same shape for all three media types:

- Name, sort name, description, cover.
- Ordered members. A member is a series or a single item, so books with no series can join.
  Comics only need series, since every comic is in one.
- An optional short note per member, such as "start here" or "guide". This replaces the
  free-text role on ebook group members.

Comic collections exist. Ebook groups become collections. Audiobooks get them new.

### Reading lists (new)

An ordered list of issues across series, shared across the library and edited by users with
edit-metadata permission. Collections cannot express these because they hold whole series.
Examples:

- An event: the core series and its tie-ins, interleaved in reading order.
- "Wolverine: start here": a curated path through several volumes and minis.

Personal lists (`lists`) stay as they are and keep holding whole series.

## Comics home

1. Continue reading.
2. Shelves for main characters and collections: Wolverine, Rogue, Batman…
3. Browse tabs: Series · Characters · Publishers · Events · Collections.

The Series tab is today's grid. It stops being the home page.

A character page, for example Wolverine:

1. Solo series, by start year.
2. Team-ups and minis.
3. Events: reading lists that include his series.
4. Collections that contain his series.

## Same shape for audiobooks and ebooks

|               | Comics                                    | Audiobooks                         | Ebooks                    |
| ------------- | ----------------------------------------- | ---------------------------------- | ------------------------- |
| Fixed levels  | Series → issue                            | Series → book                      | Series → book             |
| Ways in       | Main character, publisher, event, creator | Author, narrator, genre, publisher | Author, genre, publisher  |
| Collections   | Exist                                     | New                                | Renamed from ebook groups |
| Reading lists | New                                       | New                                | New                       |

Main character is the only comics-only part. Reading lists suit books too, for reading orders
that span series.

## Server work

1. Main characters and teams on comic series.
2. Reading lists for all three media types.
3. Collections with one shape for all three media types: rename ebook groups to collections
   (tables, API and UI), add series-or-item members and per-member notes, and add collections
   for audiobooks.
4. Browse pages: characters, publishers, events, creators.
5. Comics in the metadata-gaps worklist (the MCP needs this too).

No new hierarchy levels. Creating, merging and moving comic series already exist.

## Decisions

Made 2026-10-31.

1. **Annuals are their own series.** This matches ComicVine. Komga has no guidance on annuals,
   but treats one-shots the same way.
2. **Reading lists are shared** across the library, like collections, and edited by users with
   edit-metadata permission.
3. **Ebook groups are renamed to collections everywhere**, including tables and API paths.
   Nobody uses them yet, so breaking the old paths is fine. They also take the shared
   collection shape above.
4. **Files on disk do not change.** Series fixes live in the database and are pinned so rescans
   do not undo them. Torrents keep seeding and other tools keep their paths.
