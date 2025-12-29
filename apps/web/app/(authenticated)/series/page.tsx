"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Input } from "@repo/ui/components/ui/input";
import { Button } from "@repo/ui/components/ui/button";
import { SeriesGrid } from "../../../components/series/series-grid";
import { SeriesSortSelect } from "../../../components/series/series-sort-select";
import {
  useInfiniteSeries,
  type SeriesSortBy,
  type SeriesSortOrder,
} from "../../../lib/use-series";
import { useDebouncedValue } from "../../../lib/use-debounced-value";

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

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchInput("");
  }, []);

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

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 p-4 lg:p-6">
          <h1 className="text-xl font-semibold lg:text-2xl">{t("title")}</h1>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t("search")}
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-[200px] pl-9 pr-8 lg:w-[280px]"
              />
              {searchInput && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                  onClick={handleClearSearch}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            {/* Sort */}
            <SeriesSortSelect
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 lg:p-6">
        <div className="mx-auto max-w-7xl">
          <SeriesGrid
            series={allSeries}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            fetchNextPage={fetchNextPage}
          />
        </div>
      </div>
    </div>
  );
}
