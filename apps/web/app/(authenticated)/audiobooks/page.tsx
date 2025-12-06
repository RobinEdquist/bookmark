"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@repo/ui/components/ui/input";
import { AudiobookGrid } from "../../../components/audiobooks/audiobook-grid";
import { useAudiobooks } from "../../../lib/use-audiobooks";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { SortSelect } from "../../../components/library/sort-select";
import { useSortPreference } from "../../../lib/use-sort-preference";

export default function AudiobooksPage() {
  const t = useTranslations("audiobooks");

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const { sortBy, sortOrder, setSortField, isLoaded } = useSortPreference("audiobooks");
  const { data, isLoading, isFetching, error } = useAudiobooks({
    search: debouncedSearch || undefined,
    sortBy,
    sortOrder,
  });

  // Show spinner when search is pending (query differs from debounced) or fetching
  const isSearching = searchQuery !== debouncedSearch || isFetching;

  // Only show skeleton loading on initial load, not during search
  const showSkeletons = isLoading && !data;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <div className="relative w-64">
            {isSearching ? (
              <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              type="text"
              placeholder={t("filters.search")}
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
        </header>

        <AudiobookGrid
          audiobooks={data?.audiobooks ?? []}
          isLoading={showSkeletons}
          error={error}
        />
      </div>
    </div>
  );
}
