"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { EditAudiobookDialog } from "../audiobooks/edit-audiobook-dialog";
import { EditEbookDialog } from "../ebooks/edit-ebook-dialog";
import { GoodreadsSearchDialog } from "../goodreads/goodreads-search-dialog";
import { HardcoverSyncDialog } from "../hardcover/hardcover-sync-dialog";
import { GapFilterChips } from "./gap-filter-chips";
import { MetadataGapsTable } from "./metadata-gaps-table";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { queryKeys } from "../../lib/query-keys";
import {
  useMetadataGaps,
  useMetadataGapsSummary,
  type GapMediaType,
  type GapSort,
  type MetadataGapItem,
} from "../../lib/use-metadata-gaps";
import type { AudiobookListItem } from "../../lib/use-audiobooks";
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

export function MetadataGapsPanel({ type }: MetadataGapsPanelProps) {
  const t = useTranslations("admin.metadata");
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string[]>([]);
  const [match, setMatch] = useState<"any" | "all">("any");
  const [sort, setSort] = useState<GapSort>("newest");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [editing, setEditing] = useState<MetadataGapItem | null>(null);
  const [linkingHardcover, setLinkingHardcover] =
    useState<MetadataGapItem | null>(null);
  const [linkingGoodreads, setLinkingGoodreads] =
    useState<MetadataGapItem | null>(null);

  const { data: summary, isLoading: summaryLoading } =
    useMetadataGapsSummary(type);
  const { data, isLoading, isFetching } = useMetadataGaps({
    type,
    missing: selected,
    match,
    sort,
    search: debouncedSearch,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

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
    setSelected((current) => {
      const next = current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];
      if (next.length < 2) setMatch("any");
      return next;
    });
    setPage(0);
  };

  const changeMatch = (mode: "any" | "all") => {
    setMatch(mode);
    setPage(0);
  };

  const changeSort = (value: GapSort) => {
    setSort(value);
    setPage(0);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const clearFilters = () => {
    setSelected([]);
    setMatch("any");
    setPage(0);
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
            value={search}
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
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((current) => current + 1)}
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
