"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@repo/ui/components/ui/input";
import { AudiobookGrid } from "../../../components/audiobooks/audiobook-grid";
import { useInfiniteAudiobooks } from "../../../lib/use-audiobooks";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { SortSelect } from "../../../components/library/sort-select";
import { useSortPreference } from "../../../lib/use-sort-preference";
import { useSaveLibraryUrl } from "../../../lib/use-library-return-url";
import {
  useSaveScrollPosition,
  useRestoreScrollPosition,
  clearScrollState,
} from "../../../lib/use-scroll-position";
import { MobileLibraryHeader } from "../../../components/layout/mobile-library-header";
import { authClient } from "../../../lib/auth-client";

export default function AudiobooksPage() {
  const t = useTranslations("audiobooks.filters");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  // Save current URL for back navigation from detail pages
  useSaveLibraryUrl("/audiobooks");

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
    const newUrl = params.toString() ? `/audiobooks?${params.toString()}` : "/audiobooks";
    router.replace(newUrl, { scroll: false });
  }, [debouncedSearch, router, searchParams]);
  const { sortBy, sortOrder, setSortField } = useSortPreference("audiobooks");
  const {
    data,
    isLoading,
    isFetching,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteAudiobooks({
    search: debouncedSearch || undefined,
    sortBy,
    sortOrder,
  });

  // Flatten pages into single array
  const audiobooks = data?.pages.flatMap((page) => page.audiobooks) ?? [];

  // Scroll position restoration
  const pagesLoaded = data?.pages.length ?? 0;
  const searchParamsKey = `${debouncedSearch ?? ""}-${sortBy}-${sortOrder}`;

  // Clear scroll position when search/sort changes
  const prevSearchParamsKey = useRef(searchParamsKey);
  useEffect(() => {
    if (prevSearchParamsKey.current !== searchParamsKey) {
      clearScrollState("/audiobooks");
      prevSearchParamsKey.current = searchParamsKey;
    }
  }, [searchParamsKey]);

  // Save scroll position when navigating away
  useSaveScrollPosition("/audiobooks", searchParamsKey, pagesLoaded);

  // Restore scroll position when returning from detail page
  const { isRestoring } = useRestoreScrollPosition(
    "/audiobooks",
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
      {/* Mobile header */}
      <MobileLibraryHeader
        searchPlaceholder={t("search")}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={setSortField}
        isAdmin={isAdmin}
      />

      {/* Desktop header */}
      <header className="sticky top-0 z-10 hidden border-b border-border/50 bg-background/80 px-8 py-4 backdrop-blur-sm lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <div className="relative w-64">
            {isSearching ? (
              <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              type="text"
              placeholder={t("search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <SortSelect
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={setSortField}
          />
        </div>
      </header>

      <div
        className={`p-4 pt-4 transition-opacity duration-300 lg:p-8 lg:pt-6 ${
          isRestoring ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="mx-auto max-w-7xl">
          <AudiobookGrid
            audiobooks={audiobooks}
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
