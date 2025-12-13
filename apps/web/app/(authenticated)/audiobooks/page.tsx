"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@repo/ui/components/ui/input";
import { AudiobookGrid } from "../../../components/audiobooks/audiobook-grid";
import { useAudiobooks } from "../../../lib/use-audiobooks";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { SortSelect } from "../../../components/library/sort-select";
import { useSortPreference } from "../../../lib/use-sort-preference";
import { MobileLibraryHeader } from "../../../components/layout/mobile-library-header";
import { authClient } from "../../../lib/auth-client";

export default function AudiobooksPage() {
  const t = useTranslations("audiobooks");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  // Read search from URL params, use local state for immediate input feedback
  const searchFromUrl = searchParams.get("search") ?? "";
  const [searchQuery, setSearchQuery] = useState(searchFromUrl);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Sync URL → input when URL changes (e.g., back navigation)
  useEffect(() => {
    setSearchQuery(searchFromUrl);
  }, [searchFromUrl]);

  // Sync input → URL when debounced value changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    } else {
      params.delete("search");
    }
    const newUrl = params.toString() ? `/audiobooks?${params.toString()}` : "/audiobooks";
    if (newUrl !== `/audiobooks${window.location.search}`) {
      router.replace(newUrl, { scroll: false });
    }
  }, [debouncedSearch, router, searchParams]);
  const { sortBy, sortOrder, setSortField } = useSortPreference("audiobooks");
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
    <div className="flex flex-col">
      {/* Mobile header */}
      <MobileLibraryHeader
        title={t("title")}
        searchPlaceholder={t("filters.search")}
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
        </div>
      </header>

      <div className="p-4 pt-4 lg:p-8 lg:pt-6">
        <div className="mx-auto max-w-7xl">
          <AudiobookGrid
            audiobooks={data?.audiobooks ?? []}
            isLoading={showSkeletons}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}
