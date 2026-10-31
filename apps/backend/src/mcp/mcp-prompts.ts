import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export interface TidyComicsArgs {
  scope?: string;
  descriptions?: 'keep' | 'replace';
  fileData?: 'keep' | 'replace';
  approval?: 'each' | 'batch';
}

/**
 * The prompts the server offers. Claude Code shows each as a slash command,
 * e.g. /mcp__bookmark__tidy_comics.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'tidy_comics',
    {
      title: 'Tidy comics',
      description:
        'Walk through comic series with poor metadata: identify, link ComicVine, fix series, set main characters, build collections.',
      argsSchema: {
        scope: z
          .string()
          .optional()
          .describe('Text to limit the session to, e.g. "Wolverine"'),
        descriptions: z
          .enum(['keep', 'replace'])
          .optional()
          .describe("keep ComicVine's descriptions, or replace them"),
        fileData: z
          .enum(['keep', 'replace'])
          .optional()
          .describe("keep the files' own data, or replace it"),
        approval: z
          .enum(['each', 'batch'])
          .optional()
          .describe('ask before each change, or per batch of series'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: tidyComicsText(args) },
        },
      ],
    }),
  );
}

/** The tidy comics session, with the user's preferences filled in. */
export function tidyComicsText(args: TidyComicsArgs): string {
  const ask = 'not given: ask me before you change any';
  const descriptions =
    args.descriptions === 'keep'
      ? "Keep ComicVine's descriptions. Do not write a description where ComicVine has one."
      : args.descriptions === 'replace'
        ? 'Replace descriptions with your own short, spoiler-free ones, even where ComicVine has one. Writing locks the field, so later syncs keep yours.'
        : `Descriptions: ${ask}.`;
  const fileData =
    args.fileData === 'keep'
      ? 'Keep values that come from the files (source "file"). Only fill fields that are empty.'
      : args.fileData === 'replace'
        ? 'Replace values from the files when they are wrong or worse than what you found.'
        : `Values from the files: ${ask}.`;
  const approval =
    args.approval === 'batch'
      ? 'Show me a plan for a few series at a time, wait for my yes, then apply it.'
      : 'Ask me before each change.';
  const scope = args.scope
    ? `Only work on comic series matching "${args.scope}" (find_items with search).`
    : 'Work through the whole comics library, a few series at a time.';

  return `Help me tidy the comics in my Bookmark library.

${scope}

My preferences:
- ${descriptions}
- ${fileData}
- ${approval}

The target shape: a series is one run of a title from its #1, named "Title (Start year)", matching one ComicVine volume. Each one-shot and each annual run is its own series. Collected editions (TPB, omnibus) are their own series. The issue range is data, not part of the name. Files on disk never change.

Steps:
1. Run library_overview, then find_items with mediaType "comic" to list series that miss metadata or have no ComicVine link.
2. For each series, read get_series. Folder and file names are often the best clue. Use view_item to look at covers and first pages when the names do not say enough.
3. Find the ComicVine volume with get_match_candidates, or search_external with a cleaned-up title. Link it with link_external; its issues are then matched in the background. If you are not an admin, tell me which volume you would link and move on.
4. Fix structure. Split junk-drawer series (packs like "Limited Series & One-Shots" or "Annuals 01-10") with create_series and move_items. Merge duplicates with merge_series. Rename to "Title (Start year)" with update_series. Always run move_items and merge_series with dryRun: true first and show me the result. A merge cannot be undone.
5. Check every issue in the series, not only the series. Each needs its number: ComicVine matches issues by number, so an issue without one gets no title, date or credits. A "missing" number in the series' gaps that you can see in the issue list means an issue lost its number. A title that is only the series name or a file name ("Death of Wolverine 02_ _ _ _") is not an issue title. Fix both with update_item, then link_external on the series again to queue its issues for matching.
6. Set the one to three main characters or teams each series is about with set_main_characters. Not everyone who appears.
7. Fill in other fields with update_series and update_item, following my preferences above. Check each field's source in get_series before you change it.
8. Suggest collections, such as "Wolverine solo series", and build them with create_collection and add_to_collection. For events and reading orders across series, build reading lists with create_reading_list; add issues the library lacks as missing items.

Every write is in the change log. At the end, run list_changes with mine: true and give me a short summary. If something went wrong, undo_change reverts one change set.`;
}
