"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@repo/ui/components/ui/input";
import { Button } from "@repo/ui/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { useSearchMam, useMyRequests, useCreateRequest, useSupportRequest, type SearchFilters } from "../../../lib/use-requests";
import { RequestSearchResults } from "../../../components/requests/request-search-results";
import { MyRequestsList } from "../../../components/requests/my-requests-list";
import { SearchFiltersPanel } from "../../../components/requests/search-filters";
import { authClient } from "../../../lib/auth-client";

export default function RequestsPage() {
  const t = useTranslations("requests");
  const { isPending: sessionPending } = authClient.useSession();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "my-requests">("search");
  const [filters, setFilters] = useState<SearchFilters>({
    contentType: "all",
    searchIn: ["title", "author"],
    languages: [1], // Default to English
    perPage: 25,
  });

  const { search, isSearching, data: searchResults } = useSearchMam();
  const { data: myRequests, isLoading: requestsLoading } = useMyRequests();
  const { createRequest, isCreating } = useCreateRequest();
  const { supportRequest, isSupporting } = useSupportRequest();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      await search(searchQuery.trim(), filters);
    }
  };

  const handleRequest = async (item: Parameters<typeof createRequest>[0]) => {
    await createRequest(item);
    setActiveTab("my-requests");
  };

  const handleSupport = async (requestId: string) => {
    await supportRequest(requestId);
    setActiveTab("my-requests");
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

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("searchPlaceholder")}
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
              results={searchResults?.results ?? []}
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
