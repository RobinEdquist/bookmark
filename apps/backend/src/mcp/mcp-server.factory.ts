import { HttpException, Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
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

const INSTRUCTIONS = `Bookmark is a self-hosted library of audiobooks, ebooks and comics. These tools only read; nothing here changes the library.

Comics have two levels: a series (one ComicVine volume, ideally named "Title (Start year)") and its issues. For comics, find_items lists series; get_series lists a series' issues with their file paths; get_item and view_item take an issue id (view_item also takes a series id).

Folder and file names are often the best clue for a comic with no metadata. Paths are relative to the library root.

Every field in get_item and get_series shows the value the app displays, where it comes from (hand-edit, file, comicvine, hardcover or goodreads), and what the other sources hold. A locked field was set by hand and later syncs will not change it.

ComicVine, Hardcover and Goodreads lookups are for admins only.`;

const mediaType = z
  .enum(['audiobook', 'ebook', 'comic'])
  .describe('Which library: audiobook, ebook or comic');

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Read-only, but asks an outside service whose answers change over time. */
const READ_ONLY_EXTERNAL: ToolAnnotations = {
  ...READ_ONLY,
  openWorldHint: true,
};

const gapKeyList = (keys: readonly string[]) => keys.join(', ');

/**
 * Builds one MCP server per request, bound to the API key's user.
 *
 * The endpoint is stateless, so a server lives for one HTTP request. Building
 * it per request lets every tool close over the caller instead of reading
 * identity from transport metadata, and nothing is shared between users.
 */
@Injectable()
export class McpServerFactory {
  private readonly logger = new Logger(McpServerFactory.name);

  constructor(
    private readonly library: McpLibraryService,
    private readonly inspect: McpInspectService,
    private readonly view: McpViewService,
    private readonly external: McpExternalService,
    private readonly version: VersionService,
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
      () => this.json(() => this.library.overview(user)),
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
      (args) => this.json(() => this.library.findItems(user, args)),
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
        this.json(() => this.inspect.getItem(user, type, id)),
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
        this.json(() =>
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
        this.run(async () => {
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
          'ComicVine, Hardcover and Goodreads are for admins only.',
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
      (args) => this.json(() => this.external.search(user, args)),
    );

    server.registerTool(
      'get_match_candidates',
      {
        title: 'Get match candidates',
        description:
          'Suggested external matches for an item, searched from its current metadata. ' +
          'Comics: a series id gives ComicVine volumes with a confidence; an issue id gives issues of the linked volume, same number first. ' +
          'If the title is a folder-style name, use search_external with a cleaned-up query instead.',
        inputSchema: {
          mediaType,
          id: z.uuid(),
          source: z.enum(EXTERNAL_SOURCES).optional(),
        },
        annotations: READ_ONLY_EXTERNAL,
      },
      (args) => this.json(() => this.external.matchCandidates(user, args)),
    );

    return server;
  }

  /** Runs a tool and returns its result as compact JSON text. */
  private json(fn: () => Promise<object>): Promise<CallToolResult> {
    return this.run(async () => ({
      content: [{ type: 'text', text: JSON.stringify(await fn()) }],
    }));
  }

  /**
   * Turns failures into tool errors the agent can read. Expected failures
   * (refused, not found, bad input) keep their message; anything else is
   * logged and reported without internals such as SQL.
   */
  private async run(
    fn: () => Promise<CallToolResult>,
  ): Promise<CallToolResult> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof HttpException) {
        return toolError(error.message);
      }
      this.logger.error('MCP tool failed', error);
      return toolError('The tool failed on the server.');
    }
  }
}

function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
