"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EbookGrid } from "../../../components/ebooks/ebook-grid";
import { EbookGroupsView } from "../../../components/ebooks/ebook-groups-view";
import { useInfiniteEbooks } from "../../../lib/use-ebooks";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import {
  EBOOK_GROUPS_SORT_OPTIONS,
  SortSelect,
} from "../../../components/library/sort-select";
import { useSortPreference } from "../../../lib/use-sort-preference";
import { useSaveLibraryUrl } from "../../../lib/use-library-return-url";
import { useSaveLibraryNavigation } from "../../../lib/use-library-navigation";
import { useScrollRestoration } from "../../../lib/use-scroll-restoration";
import { LibraryPageHeader } from "../../../components/library/library-page-header";
import { authClient } from "../../../lib/auth-client";

export default function EbooksPage() {
  const t = useTranslations("ebooks.filters");
  const tGroups = useTranslations("ebooks");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";
  const view = searchParams.get("view") === "groups" ? "groups" : "ebooks";

  // Save current URL for back navigation from detail pages
  useSaveLibraryUrl("/ebooks");

  // Read search from URL params, use local state for immediate input feedback
  const searchFromUrl = searchParams.get("search") ?? "";
  const [searchQuery, setSearchQuery] = useState(searchFromUrl);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

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
    const newUrl = params.toString()
      ? `/ebooks?${params.toString()}`
      : "/ebooks";
    router.replace(newUrl, { scroll: false });
  }, [debouncedSearch, router, searchParams]);
  const { sortBy, sortOrder, setSortField } = useSortPreference("ebooks");
  // Groups sort on their own fields (name / recently added) and keep their own
  // stored preference, so the two tabs never clobber each other.
  const {
    sortBy: groupSortBy,
    sortOrder: groupSortOrder,
    setSortField: setGroupSortField,
  } = useSortPreference("ebook-groups");
  const {
    data,
    isLoading,
    isFetching,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteEbooks({
    search: debouncedSearch || undefined,
    sortBy: sortBy as
      "title" | "createdAt" | "author" | "rating" | "series" | undefined,
    sortOrder,
  });

  // Flatten pages into single array
  const ebooks = data?.pages.flatMap((page) => page.ebooks) ?? [];

  // Save ordered item IDs for next/prev navigation on detail pages
  useSaveLibraryNavigation(
    "/ebooks",
    ebooks.map((e) => e.id),
  );

  // Scroll position restoration (search is in the URL; sort is stored locally)
  const { hasSavedPosition } = useScrollRestoration({
    ready: !!data,
    extraKey: `${sortBy}:${sortOrder}`,
  });

  // Show spinner when search is pending (query differs from debounced) or fetching first page
  const isSearching =
    searchQuery !== debouncedSearch || (isFetching && !isFetchingNextPage);

  // Only show skeleton loading on initial load, not during search
  const showSkeletons = isLoading && !data;

  return (
    <div className="flex flex-col">
      <LibraryPageHeader
        searchPlaceholder={t("search")}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        isSearching={isSearching}
        sortControl={
          view === "ebooks" ? (
            <SortSelect
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={setSortField}
            />
          ) : (
            <SortSelect
              sortBy={groupSortBy}
              sortOrder={groupSortOrder}
              onSortChange={setGroupSortField}
              options={EBOOK_GROUPS_SORT_OPTIONS}
            />
          )
        }
        isAdmin={isAdmin}
      />

      <div className="p-4 pt-4 lg:p-8 lg:pt-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex w-fit items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <Link
              href={
                debouncedSearch
                  ? `/ebooks?search=${encodeURIComponent(debouncedSearch)}`
                  : "/ebooks"
              }
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                view === "ebooks"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tGroups("groups.tabEbooks")}
            </Link>
            <Link
              href={
                debouncedSearch
                  ? `/ebooks?view=groups&search=${encodeURIComponent(debouncedSearch)}`
                  : "/ebooks?view=groups"
              }
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                view === "groups"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tGroups("groups.tabGroups")}
            </Link>
          </div>
          {view === "groups" ? (
            <EbookGroupsView
              search={debouncedSearch}
              sortBy={groupSortBy === "recentlyAdded" ? "recentlyAdded" : "name"}
              sortOrder={groupSortOrder}
              animateEntrance={!hasSavedPosition}
            />
          ) : (
            <EbookGrid
              ebooks={ebooks}
              isLoading={showSkeletons}
              error={error}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
              animateEntrance={!hasSavedPosition}
            />
          )}
        </div>
      </div>
    </div>
  );
}
