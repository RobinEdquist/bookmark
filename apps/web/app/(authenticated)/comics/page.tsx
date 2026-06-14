"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { ComicSeriesGrid } from "../../../components/comics/comic-series-grid";
import { ComicCollectionsView } from "../../../components/comics/comic-collections-view";
import { useInfiniteComicSeries } from "../../../lib/use-comics";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { SortSelect, COMICS_SORT_OPTIONS } from "../../../components/library/sort-select";
import { useSortPreference } from "../../../lib/use-sort-preference";
import { useSaveLibraryUrl } from "../../../lib/use-library-return-url";
import { useSaveLibraryNavigation } from "../../../lib/use-library-navigation";
import {
  useSaveScrollPosition,
  useRestoreScrollPosition,
  clearScrollState,
} from "../../../lib/use-scroll-position";
import { LibraryPageHeader } from "../../../components/library/library-page-header";
import { authClient } from "../../../lib/auth-client";
import type { ComicSeriesFilters } from "../../../lib/use-comics";

// Map SortField values to ComicSeriesFilters.sortBy
function toComicSortBy(
  sortBy: string,
): ComicSeriesFilters["sortBy"] {
  if (sortBy === "recentlyAdded" || sortBy === "startYear" || sortBy === "title") {
    return sortBy;
  }
  return "title";
}

export default function ComicsPage() {
  const t = useTranslations("comics.filters");
  const tComics = useTranslations("comics");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  // Browse mode: "series" (default) or "collections"
  const view = searchParams.get("view") === "collections" ? "collections" : "series";

  // Save current URL for back navigation from detail pages
  useSaveLibraryUrl("/comics");

  // Read search from URL params, use local state for immediate input feedback
  const searchFromUrl = searchParams.get("search") ?? "";
  const [searchQuery, setSearchQuery] = useState(searchFromUrl);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Read metadataTag directly from URL (no local state — navigation sets it)
  const activeMetadataTag = searchParams.get("metadataTag") ?? undefined;

  // Decode the display value: everything after the first colon
  const activeMetadataTagLabel = activeMetadataTag
    ? activeMetadataTag.substring(activeMetadataTag.indexOf(":") + 1)
    : undefined;

  // Track if we're the ones updating the URL to avoid circular sync
  const isUpdatingUrl = useRef(false);

  // Sync URL → input only for external navigation (e.g., back button)
  useEffect(() => {
    if (!isUpdatingUrl.current) {
      setSearchQuery(searchFromUrl);
    }
    isUpdatingUrl.current = false;
  }, [searchFromUrl]);

  // Sync input → URL when debounced value changes
  useEffect(() => {
    const currentSearch = searchParams.get("search") ?? "";
    if (debouncedSearch === currentSearch) return;

    isUpdatingUrl.current = true;
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    } else {
      params.delete("search");
    }
    const newUrl = params.toString() ? `/comics?${params.toString()}` : "/comics";
    router.replace(newUrl, { scroll: false });
  }, [debouncedSearch, router, searchParams]);

  const { sortBy, sortOrder, setSortField } = useSortPreference("comics");
  const comicSortBy = toComicSortBy(sortBy);

  const {
    data,
    isLoading,
    isFetching,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteComicSeries({
    search: debouncedSearch || undefined,
    sortBy: comicSortBy,
    sortOrder,
    metadataTag: activeMetadataTag,
  });

  // Flatten pages into single array
  const series = data?.pages.flatMap((page) => page.series) ?? [];

  // Save ordered item IDs for next/prev navigation on detail pages
  useSaveLibraryNavigation("/comics", series.map((s) => s.id));

  // Scroll position restoration
  const pagesLoaded = data?.pages.length ?? 0;
  const searchParamsKey = `${debouncedSearch ?? ""}-${sortBy}-${sortOrder}-${activeMetadataTag ?? ""}`;

  // Clear scroll position when search/sort/filter changes
  const prevSearchParamsKey = useRef(searchParamsKey);
  useEffect(() => {
    if (prevSearchParamsKey.current !== searchParamsKey) {
      clearScrollState("/comics");
      prevSearchParamsKey.current = searchParamsKey;
    }
  }, [searchParamsKey]);

  // Save scroll position when navigating away
  useSaveScrollPosition("/comics", searchParamsKey, pagesLoaded);

  // Restore scroll position when returning from detail page
  const { isRestoring } = useRestoreScrollPosition(
    "/comics",
    searchParamsKey,
    pagesLoaded,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage ?? false
  );

  // Show spinner when search is pending (query differs from debounced) or fetching first page
  const isSearching = searchQuery !== debouncedSearch || (isFetching && !isFetchingNextPage);

  // Only show skeleton loading on initial load, not during search
  const showSkeletons = isLoading && !data;

  // Toggle hrefs: preserve search param, set/clear view param
  const seriesHref = debouncedSearch
    ? `/comics?search=${encodeURIComponent(debouncedSearch)}`
    : "/comics";
  const collectionsHref = debouncedSearch
    ? `/comics?view=collections&search=${encodeURIComponent(debouncedSearch)}`
    : "/comics?view=collections";

  return (
    <div className="flex flex-col">
      <LibraryPageHeader
        searchPlaceholder={t("search")}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        isSearching={isSearching}
        sortControl={
          view === "series" ? (
            <SortSelect
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={setSortField}
              options={COMICS_SORT_OPTIONS}
            />
          ) : undefined
        }
        isAdmin={isAdmin}
      />

      <div
        className={`p-4 pt-4 transition-opacity duration-300 lg:p-8 lg:pt-6 ${
          isRestoring ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="mx-auto max-w-7xl">
          {/* Series | Collections toggle */}
          <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
            <Link
              href={seriesHref}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                view === "series"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tComics("collections.tabSeries")}
            </Link>
            <Link
              href={collectionsHref}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                view === "collections"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tComics("collections.tabCollections")}
            </Link>
          </div>

          {/* Active metadata tag filter chip (series mode only) */}
          {view === "series" && activeMetadataTag && activeMetadataTagLabel && (
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {t("filteredBy", { value: activeMetadataTagLabel })}
                <Link
                  href="/comics"
                  aria-label={t("clearFilter")}
                  className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3.5 w-3.5" />
                </Link>
              </span>
            </div>
          )}

          {view === "collections" ? (
            <ComicCollectionsView search={debouncedSearch} />
          ) : (
            <ComicSeriesGrid
              series={series}
              isLoading={showSkeletons}
              error={error}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
