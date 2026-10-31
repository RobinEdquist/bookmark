import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { VersionService } from '../version/version.service';
import { GAP_SORTS } from '../metadata-gaps/dto/metadata-gaps.dto';
import {
  AUDIOBOOK_GAP_KEYS,
  COMIC_GAP_KEYS,
  EBOOK_GAP_KEYS,
} from '../metadata-gaps/gap-definitions';
import {
  FIND_ITEMS_DEFAULT_LIMIT,
  McpLibraryService,
} from './mcp-library.service';
import { McpInspectService } from './mcp-inspect.service';
import {
  McpViewService,
  VIEW_DEFAULT_PAGES,
  VIEW_MAX_PAGES,
} from './mcp-view.service';
import { EXTERNAL_SOURCES, McpExternalService } from './mcp-external.service';
import { McpWriteTools } from './mcp-write-tools';
import { registerPrompts } from './mcp-prompts';
import { mediaTypeSchema } from './mcp-fields';
import {
  READ_ONLY,
  READ_ONLY_EXTERNAL,
  jsonResult,
  runTool,
} from './mcp-tool-result';

const INSTRUCTIONS = `Bookmark is a self-hosted library of audiobooks, ebooks and comics.

Comics have two levels: a series (one ComicVine volume, ideally named "Title (Start year)") and its issues. For comics, find_items lists series; get_series lists a series' issues with their file paths; get_item and view_item take an issue id (view_item also takes a series id).

Folder and file names are often the best clue for a comic with no metadata. Paths are relative to the library root. Files on disk are never changed: every fix lives in the database.

Every field in get_item and get_series shows the value the app displays, where it comes from (hand-edit, file, comicvine, hardcover or goodreads), and what the other sources hold. A locked field was set by hand or by these tools, and later syncs and rescans leave it alone. Every write locks the fields it sets; unlock_field removes a lock.

Whether to keep ComicVine's and the files' data or replace it is the user's choice. Ask if they have not said.

Every write is recorded in the change log as one change set per tool call: list_changes shows it, undo_change reverts it. Merges cannot be undone. move_items, merge_series and the update tools take dryRun: true; show the user the plan before applying a structural change. Nothing here deletes items, series or collections, but a move or merge that empties a series deletes that series; the change log keeps its details.

Editing needs permission to edit metadata. ComicVine, Hardcover and Goodreads are for admins only.`;

const mediaType = mediaTypeSchema;

const gapKeyList = (keys: readonly string[]) => keys.join(', ');

/**
 * Builds one MCP server per request, bound to the API key's user. The read
 * tools are registered here, the write tools by McpWriteTools.
 *
 * The endpoint is stateless, so a server lives for one HTTP request. Building
 * it per request lets every tool close over the caller instead of reading
 * identity from transport metadata, and nothing is shared between users.
 */
@Injectable()
export class McpServerFactory {
  constructor(
    private readonly library: McpLibraryService,
    private readonly inspect: McpInspectService,
    private readonly view: McpViewService,
    private readonly external: McpExternalService,
    private readonly version: VersionService,
    private readonly writeTools: McpWriteTools,
  ) {}

  create(user: AuthenticatedUser): McpServer {
    const server = new McpServer(
      { name: 'bookmark', version: this.version.getVersion().version },
      { instructions: INSTRUCTIONS },
    );

    server.registerTool(
      'library_overview',
      {
        title: 'Library overview',
        description:
          'Counts per library and how many items are missing each kind of metadata. Start here. Needs permission to edit metadata.',
        annotations: READ_ONLY,
      },
      () => jsonResult(() => this.library.overview(user)),
    );

    server.registerTool(
      'find_items',
      {
        title: 'Find items',
        description:
          'Paged list of items that need metadata work, by gap, link status, series or text. ' +
          'For comics each item is a series. ' +
          `Gaps: audiobook: ${gapKeyList(AUDIOBOOK_GAP_KEYS)}. ` +
          `ebook: ${gapKeyList(EBOOK_GAP_KEYS)}. ` +
          `comic: ${gapKeyList(COMIC_GAP_KEYS)}. ` +
          'Needs permission to edit metadata.',
        inputSchema: {
          mediaType,
          missing: z
            .array(z.string())
            .optional()
            .describe('Gap keys to filter on (see the list above)'),
          match: z
            .enum(['any', 'all'])
            .optional()
            .describe('Whether an item needs any or all of `missing`'),
          unlinked: z
            .boolean()
            .optional()
            .describe('Only items with no external link at all'),
          noSeries: z
            .boolean()
            .optional()
            .describe('Only audiobooks or ebooks in no series'),
          withGaps: z
            .boolean()
            .optional()
            .describe(
              'Default true: only items with at least one gap. Set false with `search` to find any item.',
            ),
          search: z
            .string()
            .optional()
            .describe('Text in the title (or, for comics, the ComicVine name)'),
          sort: z.enum(GAP_SORTS).optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe(`Page size, default ${FIND_ITEMS_DEFAULT_LIMIT}`),
          offset: z.number().int().min(0).optional(),
        },
        annotations: READ_ONLY,
      },
      (args) => jsonResult(() => this.library.findItems(user, args)),
    );

    server.registerTool(
      'get_item',
      {
        title: 'Get item',
        description:
          'Full metadata for one audiobook, ebook or comic issue: each field with its shown value, source and what other sources hold; external links; and the path relative to the library root.',
        inputSchema: { mediaType, id: z.uuid() },
        annotations: READ_ONLY,
      },
      ({ mediaType: type, id }) =>
        jsonResult(() => this.inspect.getItem(user, type, id)),
    );

    server.registerTool(
      'get_series',
      {
        title: 'Get series',
        description:
          'Full metadata for a series. For comics: fields with sources, ComicVine link, main characters, folder path, and a page of issues with their file paths. ' +
          'Audiobook and ebook series are shared, so either type returns both lists.',
        inputSchema: {
          mediaType,
          id: z.uuid(),
          issuesOffset: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Comics: first issue to list'),
          issuesLimit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .describe('Comics: issues to list, default 50'),
        },
        annotations: READ_ONLY,
      },
      ({ mediaType: type, id, issuesOffset, issuesLimit }) =>
        jsonResult(() =>
          this.inspect.getSeries(user, type, id, {
            offset: issuesOffset,
            limit: issuesLimit,
          }),
        ),
    );

    server.registerTool(
      'view_item',
      {
        title: 'View item',
        description:
          'The cover as an image, and for comics the first pages. For comics, `id` can be an issue or a series (then the series cover and its first issue). Page 1 is usually the cover, so pages start at 2 by default.',
        inputSchema: {
          mediaType,
          id: z.uuid(),
          startPage: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe('Comics: first page to show, 1-based. Default 2'),
          pages: z
            .number()
            .int()
            .min(0)
            .max(VIEW_MAX_PAGES)
            .optional()
            .describe(`Comics: pages to show, default ${VIEW_DEFAULT_PAGES}`),
        },
        annotations: READ_ONLY,
      },
      ({ mediaType: type, id, startPage, pages }) =>
        runTool(async () => {
          const result = await this.view.view(user, type, id, {
            startPage,
            pages,
          });
          return {
            content: [
              { type: 'text', text: JSON.stringify(result.summary) },
              ...result.images.map((image) => ({
                type: 'image' as const,
                data: image.data.toString('base64'),
                mimeType: image.mimeType,
              })),
            ],
          };
        }),
    );

    server.registerTool(
      'search_external',
      {
        title: 'Search external sources',
        description:
          'Search an outside catalogue by text. comic: comicvine (volumes). audiobook: hardcover, goodreads, audible, itunes. ebook: hardcover, goodreads, itunes. ' +
          'ComicVine, Hardcover and Goodreads are for admins only. ' +
          'ComicVine finds volumes whose name contains the text, so search with the title only ("Wolverine", not "Wolverine 1982") and compare start years in the results. ' +
          'If the text finds nothing, a cleaned-up version is tried; `query` shows what was searched.',
        inputSchema: {
          mediaType,
          source: z
            .enum(EXTERNAL_SOURCES)
            .optional()
            .describe(
              'Default: comicvine for comics, hardcover for audiobooks and ebooks',
            ),
          query: z.string().min(1),
          author: z.string().optional().describe('Audible only'),
          page: z.number().int().min(1).optional(),
        },
        annotations: READ_ONLY_EXTERNAL,
      },
      (args) => jsonResult(() => this.external.search(user, args)),
    );

    server.registerTool(
      'get_match_candidates',
      {
        title: 'Get match candidates',
        description:
          'Suggested external matches for an item, searched from its current metadata. ' +
          'Comics: a series id gives ComicVine volumes with a confidence; an issue id gives issues of the linked volume, same number first. ' +
          'Folder-style series titles are cleaned before searching (order numbers, volume markers, issue ranges and years removed); `query` shows what was searched. ' +
          'If nothing is found, try search_external with other title words.',
        inputSchema: {
          mediaType,
          id: z.uuid(),
          source: z.enum(EXTERNAL_SOURCES).optional(),
        },
        annotations: READ_ONLY_EXTERNAL,
      },
      (args) => jsonResult(() => this.external.matchCandidates(user, args)),
    );

    this.writeTools.register(server, user);
    registerPrompts(server);
    return server;
  }
}
