"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search, X, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { AudiobookGrid } from "../../components/audiobooks/audiobook-grid";
import { useAudiobooks } from "../../lib/use-audiobooks";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { authClient } from "../../lib/auth-client";

export default function LibrariesPage() {
  const t = useTranslations("audiobooks");
  const tCommon = useTranslations("common");
  const { data: session } = authClient.useSession();
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const { data, isLoading, isFetching, error } = useAudiobooks({
    search: debouncedSearch || undefined,
  });

  // Show spinner when search is pending (query differs from debounced) or fetching
  const isSearching = searchQuery !== debouncedSearch || isFetching;

  // Only show skeleton loading on initial load, not during search
  const showSkeletons = isLoading && !data;

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
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
          </div>
          <nav className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" asChild>
                <Link href="/settings">{tCommon("nav.settings")}</Link>
              </Button>
            )}
            <Button variant="outline" onClick={handleSignOut}>
              {tCommon("nav.signOut")}
            </Button>
          </nav>
        </header>

        <AudiobookGrid
          audiobooks={data?.audiobooks ?? []}
          isLoading={showSkeletons}
          error={error}
        />
      </div>
    </main>
  );
}
