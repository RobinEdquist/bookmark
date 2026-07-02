"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AudiobookGrid } from "../../../components/audiobooks/audiobook-grid";
import { useInfiniteAudiobooks } from "../../../lib/use-audiobooks";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { SortSelect } from "../../../components/library/sort-select";
import { useSortPreference } from "../../../lib/use-sort-preference";
import { useSaveLibraryUrl } from "../../../lib/use-library-return-url";
import { useSaveLibraryNavigation } from "../../../lib/use-library-navigation";
import { useScrollRestoration } from "../../../lib/use-scroll-restoration";
import { LibraryPageHeader } from "../../../components/library/library-page-header";
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
    sortBy: sortBy as "title" | "createdAt" | "author" | "rating" | "series" | undefined,
    sortOrder,
  });

  // Flatten pages into single array
  const audiobooks = data?.pages.flatMap((page) => page.audiobooks) ?? [];

  // Save ordered item IDs for next/prev navigation on detail pages
  useSaveLibraryNavigation("/audiobooks", audiobooks.map((a) => a.id));

  // Scroll position restoration (search is in the URL; sort is stored locally)
  const { hasSavedPosition } = useScrollRestoration({
    ready: !!data,
    extraKey: `${sortBy}:${sortOrder}`,
  });

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

      <div className="p-4 pt-4 lg:p-8 lg:pt-6">
        <div className="mx-auto max-w-7xl">
          <AudiobookGrid
            audiobooks={audiobooks}
            isLoading={showSkeletons}
            error={error}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            animateEntrance={!hasSavedPosition}
          />
        </div>
      </div>
    </div>
  );
}
