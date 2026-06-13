"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EbookGrid } from "../../../components/ebooks/ebook-grid";
import { useInfiniteEbooks } from "../../../lib/use-ebooks";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { SortSelect } from "../../../components/library/sort-select";
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

export default function EbooksPage() {
  const t = useTranslations("ebooks.filters");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

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
    const newUrl = params.toString() ? `/ebooks?${params.toString()}` : "/ebooks";
    router.replace(newUrl, { scroll: false });
  }, [debouncedSearch, router, searchParams]);
  const { sortBy, sortOrder, setSortField } = useSortPreference("ebooks");
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
    sortBy: sortBy as "title" | "createdAt" | "author" | "rating" | "series" | undefined,
    sortOrder,
  });

  // Flatten pages into single array
  const ebooks = data?.pages.flatMap((page) => page.ebooks) ?? [];

  // Save ordered item IDs for next/prev navigation on detail pages
  useSaveLibraryNavigation("/ebooks", ebooks.map((e) => e.id));

  // Scroll position restoration
  const pagesLoaded = data?.pages.length ?? 0;
  const searchParamsKey = `${debouncedSearch ?? ""}-${sortBy}-${sortOrder}`;

  // Clear scroll position when search/sort changes
  const prevSearchParamsKey = useRef(searchParamsKey);
  useEffect(() => {
    if (prevSearchParamsKey.current !== searchParamsKey) {
      clearScrollState("/ebooks");
      prevSearchParamsKey.current = searchParamsKey;
    }
  }, [searchParamsKey]);

  // Save scroll position when navigating away
  useSaveScrollPosition("/ebooks", searchParamsKey, pagesLoaded);

  // Restore scroll position when returning from detail page
  const { isRestoring } = useRestoreScrollPosition(
    "/ebooks",
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

  return (
    <div className="flex flex-col">
      <LibraryPageHeader
        searchPlaceholder={t("search")}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        isSearching={isSearching}
        sortControl={
          <SortSelect
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={setSortField}
          />
        }
        isAdmin={isAdmin}
      />

      <div
        className={`p-4 pt-4 transition-opacity duration-300 lg:p-8 lg:pt-6 ${
          isRestoring ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="mx-auto max-w-7xl">
          <EbookGrid
            ebooks={ebooks}
            isLoading={showSkeletons}
            error={error}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
          />
        </div>
      </div>
    </div>
  );
}
