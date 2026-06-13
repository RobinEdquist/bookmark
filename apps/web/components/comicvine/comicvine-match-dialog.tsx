"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, Search } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  useComicvineVolumeForSeries,
  useComicvineSearchVolumes,
  useComicvineIssuesForBook,
  useLinkSeriesToVolume,
  useLinkBookToIssue,
  type ComicvineVolume,
  type ComicvineBookLink,
} from "../../lib/use-comicvine";

const SERIES_PAGE_SIZE = 20;
const BOOK_PAGE_SIZE = 100;

interface ComicvineMatchDialogProps {
  level: "series" | "book";
  entityId: string;
  entityTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ComicvineMatchDialog({
  level,
  entityId,
  entityTitle,
  open,
  onOpenChange,
  onSuccess,
}: ComicvineMatchDialogProps) {
  const t = useTranslations("comicvine.matchDialog");
  const [page, setPage] = useState(1);
  const [selectedVolume, setSelectedVolume] = useState<ComicvineVolume | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ComicvineBookLink | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [customQuery, setCustomQuery] = useState<string | undefined>(undefined);

  // Series-level queries
  const {
    data: defaultData,
    isLoading: isDefaultLoading,
    error: defaultError,
  } = useComicvineVolumeForSeries(entityId, page, open && level === "series");

  const {
    data: customData,
    isLoading: isCustomLoading,
    error: customError,
  } = useComicvineSearchVolumes(
    customQuery ?? "",
    page,
    open && level === "series" && !!customQuery
  );

  // Book-level query
  const {
    data: bookData,
    isLoading: isBookLoading,
    error: bookError,
  } = useComicvineIssuesForBook(entityId, page, open && level === "book");

  // Hooks for linking
  const { linkSeries, isLinking: isLinkingSeries } = useLinkSeriesToVolume();
  const { linkBook, isLinking: isLinkingBook } = useLinkBookToIssue();

  const isLinking = isLinkingSeries || isLinkingBook;

  // Prefill search input from API-suggested query (series level, no custom query yet)
  useEffect(() => {
    if (level === "series" && defaultData?.query && !customQuery) {
      setSearchInput(defaultData.query);
    }
  }, [defaultData?.query, customQuery, level]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setCustomQuery(searchInput.trim());
      setPage(1);
      setSelectedVolume(null);
    }
  };

  const handleSelect = async () => {
    try {
      if (level === "series") {
        if (!selectedVolume) return;
        await linkSeries({ seriesId: entityId, volume: selectedVolume });
        toast.success(t("toast.linked"));
      } else {
        if (!selectedIssue) return;
        await linkBook({ bookId: entityId, issue: selectedIssue });
        toast.success(t("toast.linked"));
      }
      handleClose();
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.linkFailed"));
    }
  };

  const handleClose = () => {
    setSelectedVolume(null);
    setSelectedIssue(null);
    setPage(1);
    setSearchInput("");
    setCustomQuery(undefined);
    onOpenChange(false);
  };

  // Derive active data for series level
  const activeSeriesData = customQuery ? customData : defaultData;
  const isSeriesLoading = customQuery ? isCustomLoading : isDefaultLoading;
  const seriesError = customQuery ? customError : defaultError;

  const seriesResults = activeSeriesData?.results ?? [];
  const seriesTotalResults = activeSeriesData?.totalResults ?? 0;
  const seriesTotalPages = Math.ceil(seriesTotalResults / SERIES_PAGE_SIZE);

  // Book data
  const bookIssues = bookData?.issues ?? [];
  const bookTotalResults = bookData?.totalResults ?? 0;
  const bookTotalPages = Math.ceil(bookTotalResults / BOOK_PAGE_SIZE);
  const bookLinkedVolume = bookData?.linkedVolume;

  const isLoading = level === "series" ? isSeriesLoading : isBookLoading;
  const error = level === "series" ? seriesError : bookError;
  const totalPages = level === "series" ? seriesTotalPages : bookTotalPages;
  const totalResults = level === "series" ? seriesTotalResults : bookTotalResults;
  const hasSelection = level === "series" ? !!selectedVolume : !!selectedIssue;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {level === "series" ? t("titleSeries") : t("titleBook")}
          </DialogTitle>
          <DialogDescription>
            {level === "series"
              ? t("descriptionSeries", { title: entityTitle })
              : t("descriptionBook", { title: entityTitle })}
          </DialogDescription>
        </DialogHeader>

        {/* Search input — series level only */}
        {level === "series" && (
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pl-9"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={isLoading || !searchInput.trim()}
            >
              {t("search")}
            </Button>
          </form>
        )}

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Book level: series not linked guard */}
          {level === "book" && !isBookLoading && bookLinkedVolume === false ? (
            <div className="py-8 text-center text-muted-foreground">
              {t("seriesNotLinked")}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" className="text-primary" />
            </div>
          ) : error ? (
            <div className="py-8 text-center text-destructive">
              {error instanceof Error ? error.message : t("error")}
            </div>
          ) : (level === "series" ? seriesResults : bookIssues).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t("noResults")}
            </div>
          ) : (
            <>
              {/* Results count */}
              <p className="text-sm text-muted-foreground mb-3">
                {t("resultsCount", { count: totalResults })}
              </p>

              {/* Results list */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {level === "series"
                  ? seriesResults.map((volume) => {
                      const isSelected = selectedVolume?.id === volume.id;
                      const coverUrl =
                        volume.image?.medium_url ?? volume.image?.original_url ?? null;

                      return (
                        <button
                          key={volume.id}
                          type="button"
                          onClick={() => setSelectedVolume(volume)}
                          className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-muted/50"
                          }`}
                        >
                          {/* Cover image */}
                          <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded bg-muted">
                            {coverUrl ? (
                              <Image
                                src={coverUrl}
                                alt={volume.name}
                                fill
                                className="object-cover"
                                unoptimized
                                sizes="56px"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-2xl">
                                📚
                              </div>
                            )}
                          </div>

                          {/* Volume info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-medium text-sm line-clamp-2">
                                {volume.name}
                              </h3>
                              {isSelected && (
                                <Check className="h-5 w-5 text-primary flex-shrink-0" />
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2 mt-1">
                              {volume.start_year != null && (
                                <span className="text-xs text-muted-foreground">
                                  {t("startYear", { year: volume.start_year })}
                                </span>
                              )}
                              {volume.publisher?.name && (
                                <span className="text-xs text-muted-foreground">
                                  {volume.publisher.name}
                                </span>
                              )}
                              {volume.count_of_issues != null && (
                                <span className="text-xs text-muted-foreground">
                                  {t("issueCount", { count: volume.count_of_issues })}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  : bookIssues.map((issue) => {
                      const isSelected = selectedIssue?.id === issue.id;

                      return (
                        <button
                          key={issue.id}
                          type="button"
                          onClick={() => setSelectedIssue(issue)}
                          className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-muted/50"
                          }`}
                        >
                          {/* Cover image */}
                          <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded bg-muted">
                            {issue.imageUrl ? (
                              <Image
                                src={issue.imageUrl}
                                alt={issue.name ?? t("issueNumber", { number: issue.issueNumber ?? "?" })}
                                fill
                                className="object-cover"
                                unoptimized
                                sizes="56px"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-2xl">
                                📖
                              </div>
                            )}
                          </div>

                          {/* Issue info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-medium text-sm line-clamp-2">
                                {issue.issueNumber != null
                                  ? t("issueNumber", { number: issue.issueNumber })
                                  : ""}
                                {issue.name ? ` — ${issue.name}` : ""}
                              </h3>
                              {isSelected && (
                                <Check className="h-5 w-5 text-primary flex-shrink-0" />
                              )}
                            </div>

                            {issue.coverDate && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {t("coverDate", { date: issue.coverDate })}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoading}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t("previous")}
                  </Button>

                  <span className="text-sm text-muted-foreground">
                    {t("pageInfo", { current: page, total: totalPages })}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || isLoading}
                  >
                    {t("next")}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isLinking}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSelect} disabled={!hasSelection || isLinking}>
            {isLinking ? t("linking") : t("link")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
