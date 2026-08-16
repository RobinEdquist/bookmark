"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { ChapterImportDialog } from "../chapters/chapter-import-dialog";
import { EditAudiobookDialog } from "../audiobooks/edit-audiobook-dialog";
import { EditEbookDialog } from "../ebooks/edit-ebook-dialog";
import { GoodreadsSearchDialog } from "../goodreads/goodreads-search-dialog";
import { HardcoverSyncDialog } from "../hardcover/hardcover-sync-dialog";
import { GapFilterChips } from "./gap-filter-chips";
import { MetadataGapsTable } from "./metadata-gaps-table";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useUrlFilters } from "../../lib/use-url-filters";
import { queryKeys } from "../../lib/query-keys";
import {
  useMetadataGaps,
  useMetadataGapsSummary,
  type GapMediaType,
  type GapSort,
  type MetadataGapItem,
} from "../../lib/use-metadata-gaps";
import { useAudiobook, type AudiobookListItem } from "../../lib/use-audiobooks";
import type { EbookListItem } from "../../lib/use-ebooks";

const PAGE_SIZE = 50;
const SORTS: GapSort[] = ["newest", "oldest", "mostGaps", "title"];

/**
 * The edit dialogs take a list item and fetch the full record themselves once
 * opened, so the fields the worklist does not carry can stay empty here. The
 * two link flags are known, and they are the ones the dialog acts on.
 */
function toAudiobookListItem(item: MetadataGapItem): AudiobookListItem {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    duration: null,
    coverUrl: item.coverUrl,
    createdAt: item.createdAt,
    status: item.status as AudiobookListItem["status"],
    authors: [],
    series: [],
    hardcoverLinked: !item.gaps.includes("hardcoverLink"),
    hardcoverRating: null,
    hardcoverRatingsCount: null,
    goodreadsLinked: !item.gaps.includes("goodreadsLink"),
    goodreadsRating: null,
    goodreadsRatingsCount: null,
  };
}

function toEbookListItem(item: MetadataGapItem): EbookListItem {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    pageCount: null,
    coverUrl: item.coverUrl,
    createdAt: item.createdAt,
    status: item.status as EbookListItem["status"],
    authors: [],
    series: [],
    hardcoverLinked: !item.gaps.includes("hardcoverLink"),
    hardcoverRating: null,
    hardcoverRatingsCount: null,
    goodreadsLinked: !item.gaps.includes("goodreadsLink"),
    goodreadsRating: null,
    goodreadsRatingsCount: null,
  };
}

interface MetadataGapsPanelProps {
  type: GapMediaType;
}

/**
 * Opens the same Audible chapter import the audiobook detail page offers.
 *
 * The dialog needs the audiobook's current chapters and author line, which a
 * worklist row does not carry, so they are fetched on demand. It has to wait
 * for that fetch rather than render with partial props: the dialog seeds its
 * search fields with `useState(audiobookAuthor)` on mount, so an author
 * arriving later would never reach the form. The placeholder keeps the click
 * from feeling dead while that happens.
 */
function ChapterImportForItem({
  item,
  onClose,
  onImported,
}: {
  item: MetadataGapItem;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations("admin.metadata");
  const { data: audiobook } = useAudiobook(item.id);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (!audiobook) {
    return (
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">
            {t("actions.importChapters")}
          </DialogTitle>
          <div className="flex justify-center py-8">
            <LoadingSpinner size="lg" className="text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ChapterImportDialog
      audiobookId={item.id}
      audiobookTitle={audiobook.title}
      audiobookAuthor={audiobook.authors
        .map((author) => author.name)
        .join(", ")}
      currentChapters={audiobook.chapters}
      open
      onOpenChange={handleOpenChange}
      onSuccess={onImported}
    />
  );
}

/**
 * Filter state lives in the URL, so leaving the worklist to fix an item and
 * pressing Back returns to the same filter — and a filtered view is linkable.
 * Module-level so the reference stays stable across renders.
 */
const FILTER_DEFAULTS = {
  missing: [] as string[],
  match: "any",
  sort: "newest",
  q: "",
  page: 1,
};

export function MetadataGapsPanel({ type }: MetadataGapsPanelProps) {
  const t = useTranslations("admin.metadata");
  const queryClient = useQueryClient();

  const [filters, setFilters] = useUrlFilters(FILTER_DEFAULTS);

  // Typing writes to the URL on a debounce rather than per keystroke: every
  // write is a router navigation, and doing one per character is visibly slow.
  // Seeded once from the URL, which is enough — `router.replace` creates no
  // history entries, so the only way back to this panel is a remount.
  const [searchInput, setSearchInput] = useState(() => filters.q);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const [editing, setEditing] = useState<MetadataGapItem | null>(null);
  const [linkingHardcover, setLinkingHardcover] =
    useState<MetadataGapItem | null>(null);
  const [linkingGoodreads, setLinkingGoodreads] =
    useState<MetadataGapItem | null>(null);
  const [importingChapters, setImportingChapters] =
    useState<MetadataGapItem | null>(null);

  const { data: summary, isLoading: summaryLoading } =
    useMetadataGapsSummary(type);

  // Anything can arrive in a URL, and an unknown gap key is a 400 that would
  // break the whole list. The summary is the authority on which keys exist for
  // this media type, so the request waits for it rather than trusting the URL
  // or duplicating the backend's key list here.
  const validGapKeys = useMemo(
    () => new Set(summary?.gaps.map((gap) => gap.key) ?? []),
    [summary],
  );
  const selected = useMemo(
    () => filters.missing.filter((key) => validGapKeys.has(key)),
    [filters.missing, validGapKeys],
  );
  const match = filters.match === "all" && selected.length > 1 ? "all" : "any";
  const sort = SORTS.includes(filters.sort as GapSort)
    ? (filters.sort as GapSort)
    : "newest";
  const page = Math.max(0, Math.floor(filters.page) - 1);

  const { data, isLoading, isFetching } = useMetadataGaps(
    {
      type,
      missing: selected,
      match,
      sort,
      search: debouncedSearch,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { enabled: Boolean(summary) },
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  // The worklist shrinks as it is worked through — closing the edit dialog
  // refetches, and enough fixes drop the total below the current offset. If
  // the pager were shown only for `total > PAGE_SIZE` it would unmount right
  // when that happens, stranding the table on an empty offset with no way
  // back. Keeping it while `page > 0` means there is always a way out.
  const showPagination = total > PAGE_SIZE || page > 0;

  // The debounced search term is a filter like any other, so it belongs in the
  // URL — but only once it settles, and only when it actually changed.
  useEffect(() => {
    if (debouncedSearch !== filters.q) {
      setFilters({ q: debouncedSearch, page: 1 });
    }
  }, [debouncedSearch, filters.q, setFilters]);

  const invalidateGaps = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.metadataGaps.all });
  };

  // Every control that changes what is being asked for restarts paging:
  // staying on page 4 of a filter that now has one page shows an empty table.
  //
  // The any/all toggle only renders while two or more chips are selected, so
  // dropping below that has to reset `match` too. Otherwise a stale "all"
  // survives with no visible control to undo it.
  const toggleGap = (key: string) => {
    const next = selected.includes(key)
      ? selected.filter((entry) => entry !== key)
      : [...selected, key];
    setFilters({
      missing: next,
      match: next.length < 2 ? "any" : match,
      page: 1,
    });
  };

  const changeMatch = (mode: "any" | "all") => {
    setFilters({ match: mode, page: 1 });
  };

  const changeSort = (value: GapSort) => {
    setFilters({ sort: value, page: 1 });
  };

  const changeSearch = (value: string) => {
    setSearchInput(value);
  };

  const clearFilters = () => {
    setFilters({ missing: [], match: "any", page: 1 });
  };

  const setPage = (next: number) => {
    setFilters({ page: next + 1 });
  };

  const navigateTo = (id: string) => {
    const next = items.find((item) => item.id === id);
    if (next) setEditing(next);
  };

  if (summaryLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-4 text-sm text-muted-foreground">
          {t("summary", {
            withGaps: summary?.itemsWithGaps ?? 0,
            total: summary?.totalItems ?? 0,
          })}
        </p>
        <GapFilterChips
          gaps={summary?.gaps ?? []}
          selected={selected}
          onToggle={toggleGap}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
            aria-label={t("searchPlaceholder")}
          />
        </div>

        {selected.length > 1 && (
          <div className="flex overflow-hidden rounded-md border">
            {(["any", "all"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeMatch(mode)}
                aria-pressed={match === mode}
                className={
                  match === mode
                    ? "bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    : "px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                }
              >
                {t(`match.${mode}`)}
              </button>
            ))}
          </div>
        )}

        <Select
          value={sort}
          onValueChange={(value) => changeSort(value as GapSort)}
        >
          <SelectTrigger className="w-[180px]" aria-label={t("sort.label")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`sort.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selected.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            {t("clearFilters")}
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" className="text-primary" />
          </div>
        ) : (
          <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
            <MetadataGapsTable
              items={items}
              gapCounts={summary?.gaps ?? []}
              detailHref={(item) =>
                type === "audiobook"
                  ? `/audiobooks/${item.id}`
                  : `/ebooks/${item.id}`
              }
              onEdit={setEditing}
              onLinkHardcover={setLinkingHardcover}
              onLinkGoodreads={setLinkingGoodreads}
              onImportChapters={
                type === "audiobook" ? setImportingChapters : undefined
              }
            />
          </div>
        )}
      </div>

      {showPagination && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("pagination", { page: page + 1, pageCount, total })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(Math.max(0, page - 1))}
            >
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      )}

      {type === "audiobook" ? (
        <EditAudiobookDialog
          audiobook={editing ? toAudiobookListItem(editing) : null}
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
              invalidateGaps();
            }
          }}
          audiobookIds={itemIds}
          onNavigate={navigateTo}
        />
      ) : (
        <EditEbookDialog
          ebook={editing ? toEbookListItem(editing) : null}
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
              invalidateGaps();
            }
          }}
          ebookIds={itemIds}
          onNavigate={navigateTo}
        />
      )}

      {linkingHardcover && (
        <HardcoverSyncDialog
          mediaType={type}
          mediaId={linkingHardcover.id}
          mediaTitle={linkingHardcover.title}
          open
          onOpenChange={(open) => {
            if (!open) setLinkingHardcover(null);
          }}
          onSuccess={invalidateGaps}
        />
      )}

      {importingChapters && (
        <ChapterImportForItem
          item={importingChapters}
          onClose={() => setImportingChapters(null)}
          onImported={invalidateGaps}
        />
      )}

      {linkingGoodreads && (
        <GoodreadsSearchDialog
          mediaType={type}
          mediaId={linkingGoodreads.id}
          mediaTitle={linkingGoodreads.title}
          open
          onOpenChange={(open) => {
            if (!open) setLinkingGoodreads(null);
          }}
          onSuccess={invalidateGaps}
        />
      )}
    </div>
  );
}
