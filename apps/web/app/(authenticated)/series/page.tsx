"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SeriesGrid } from "../../../components/series/series-grid";
import { SeriesSortSelect } from "../../../components/series/series-sort-select";
import { LibraryPageHeader } from "../../../components/library/library-page-header";
import { authClient } from "../../../lib/auth-client";
import {
  useInfiniteSeries,
  type SeriesSortBy,
  type SeriesSortOrder,
} from "../../../lib/use-series";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { useScrollRestoration } from "../../../lib/use-scroll-restoration";

export default function SeriesPage() {
  const t = useTranslations("series");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);

  // Get initial values from URL
  const initialSearch = searchParams.get("search") ?? "";
  const initialSortBy = (searchParams.get("sortBy") as SeriesSortBy) ?? "name";
  const initialSortOrder = (searchParams.get("sortOrder") as SeriesSortOrder) ?? "asc";

  // Local state
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [sortBy, setSortBy] = useState<SeriesSortBy>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<SeriesSortOrder>(initialSortOrder);

  // Debounce search
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  // Update URL when filters change (using useEffect for side effects)
  useEffect(() => {
    // Skip initial mount to avoid unnecessary URL update
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortBy !== "name") params.set("sortBy", sortBy);
    if (sortOrder !== "asc") params.set("sortOrder", sortOrder);
    const queryString = params.toString();
    router.replace(queryString ? `?${queryString}` : "/series", { scroll: false });
  }, [debouncedSearch, sortBy, sortOrder, router]);

  // Handle sort change
  const handleSortChange = useCallback(
    (newSortBy: SeriesSortBy, newSortOrder: SeriesSortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
    },
    []
  );

  // Handle search input change
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
    },
    []
  );

  // Fetch series with current filters
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteSeries({
    search: debouncedSearch || undefined,
    sortBy,
    sortOrder,
  });

  // Flatten pages
  const allSeries = useMemo(
    () => data?.pages.flatMap((page) => page.series) ?? [],
    [data]
  );

  // Scroll position restoration (search and sort are both in the URL)
  const { hasSavedPosition } = useScrollRestoration({ ready: !!data });

  return (
    <div className="flex flex-1 flex-col">
      <LibraryPageHeader
        searchPlaceholder={t("search")}
        searchValue={searchInput}
        onSearchChange={handleSearchChange}
        sortControl={
          <SeriesSortSelect
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
          />
        }
        isAdmin={isAdmin}
      />

      {/* Content */}
      <div className="flex-1 p-4 lg:p-6">
        <div className="mx-auto max-w-7xl">
          <SeriesGrid
            series={allSeries}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            fetchNextPage={fetchNextPage}
            animateEntrance={!hasSavedPosition}
          />
        </div>
      </div>
    </div>
  );
}
