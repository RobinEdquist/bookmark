"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@repo/ui/components/ui/input";
import { Button } from "@repo/ui/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { Tabs as ContentTypeTabs, TabsList as ContentTypeTabsList, TabsTrigger as ContentTypeTabsTrigger } from "@repo/ui/components/ui/tabs";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { cn } from "@repo/ui/lib/utils";
import { useSearchMam, useMyRequests, useCreateRequest, useSupportRequest, type SearchFilters, type MamSearchResult, type RequestResponse } from "../../../lib/use-requests";
import { useAutoApproveBudget } from "../../../lib/use-auto-approve-budget";
import { RequestSearchResults } from "../../../components/requests/request-search-results";
import { MyRequestsList } from "../../../components/requests/my-requests-list";
import { SearchFiltersPanel } from "../../../components/requests/search-filters";
import { authClient } from "../../../lib/auth-client";
import { queryKeys } from "../../../lib/query-keys";

export default function RequestsPage() {
  const t = useTranslations("requests");
  const queryClient = useQueryClient();
  const { isPending: sessionPending } = authClient.useSession();
  const { data: budget } = useAutoApproveBudget();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "my-requests">("search");
  const [filters, setFilters] = useState<SearchFilters>({
    contentType: "all",
    searchIn: ["title", "author"],
    languages: [1], // Default to English
    perPage: 25,
  });

  // Local state for search results (to update without re-fetching from external API)
  const [localSearchResults, setLocalSearchResults] = useState<MamSearchResult[]>([]);

  const { search, isSearching, data: searchResults } = useSearchMam();
  const { data: myRequests, isLoading: requestsLoading } = useMyRequests();
  const { createRequest, isCreating } = useCreateRequest();
  const { supportRequest, isSupporting } = useSupportRequest();

  // Sync local state with search mutation data
  useEffect(() => {
    if (searchResults?.results) {
      setLocalSearchResults(searchResults.results);
    }
  }, [searchResults]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      await search(searchQuery.trim(), filters);
    }
  };

  const handleRequest = async (item: Parameters<typeof createRequest>[0]) => {
    const newRequest = await createRequest(item);

    // Optimistically update my requests cache for instant tab count
    queryClient.setQueryData<RequestResponse[]>(
      queryKeys.requests.list(),
      (old) => (old ? [...old, newRequest] : [newRequest])
    );

    // Update local search results to show "requested" status (no external API call)
    setLocalSearchResults((prev) =>
      prev.map((result) =>
        result.id === item.mamTorrentId
          ? { ...result, existingRequestId: newRequest.id, existingRequestStatus: "pending" as const }
          : result
      )
    );

    // Show success toast instead of navigating away
    toast.success(t("toast.requested"));
  };

  const handleSupport = async (requestId: string) => {
    await supportRequest(requestId);
  };

  if (sessionPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </header>

        {/* Auto-Approve Budget Counter */}
        {budget && budget.limit > 0 && (
          <p className={cn(
            "text-sm",
            budget.remaining === 0 ? "text-muted-foreground" : "text-foreground"
          )}>
            {t('autoApprove.budget', { remaining: budget.remaining, limit: budget.limit })}
          </p>
        )}

        {/* Content Type Tabs */}
        <ContentTypeTabs
          value={filters.contentType ?? "all"}
          onValueChange={(value) => setFilters({ ...filters, contentType: value as SearchFilters["contentType"] })}
        >
          <ContentTypeTabsList>
            <ContentTypeTabsTrigger value="all">{t("filters.contentType.all")}</ContentTypeTabsTrigger>
            <ContentTypeTabsTrigger value="audiobooks">{t("filters.contentType.audiobooks")}</ContentTypeTabsTrigger>
            <ContentTypeTabsTrigger value="ebooks">{t("filters.contentType.ebooks")}</ContentTypeTabsTrigger>
          </ContentTypeTabsList>
        </ContentTypeTabs>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t(`searchPlaceholder.${filters.contentType ?? "all"}`)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? <LoadingSpinner size="sm" /> : t("searchButton")}
          </Button>
        </form>

        <SearchFiltersPanel filters={filters} onChange={setFilters} />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "search" | "my-requests")}>
          <TabsList>
            <TabsTrigger value="search">{t("tabs.searchResults")}</TabsTrigger>
            <TabsTrigger value="my-requests">
              {t("tabs.myRequests")} {myRequests?.length ? `(${myRequests.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="mt-6">
            <RequestSearchResults
              results={localSearchResults}
              isLoading={isSearching}
              onRequest={handleRequest}
              onSupport={handleSupport}
              isRequesting={isCreating}
              isSupporting={isSupporting}
            />
          </TabsContent>

          <TabsContent value="my-requests" className="mt-6">
            <MyRequestsList
              requests={myRequests ?? []}
              isLoading={requestsLoading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
