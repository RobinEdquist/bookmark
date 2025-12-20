"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Search, Loader2, BookOpen, Clock } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/ui/tabs";
import {
  useAudibleSearch,
  useAudnexusChapters,
  useImportChapters,
  type AudibleSearchResult,
} from "../../lib/use-audnexus";
import { useDebouncedValue } from "../../lib/use-debounced-value";

interface CurrentChapter {
  id: string;
  title: string;
  startTime: number;
  endTime?: number | null;
  order: number;
}

interface ChapterImportDialogProps {
  audiobookId: string;
  audiobookTitle: string;
  audiobookAuthor?: string;
  currentChapters: CurrentChapter[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ChapterImportDialog({
  audiobookId,
  audiobookTitle,
  audiobookAuthor,
  currentChapters,
  open,
  onOpenChange,
  onSuccess,
}: ChapterImportDialogProps) {
  const t = useTranslations("audiobooks.chapterImport");
  const [tab, setTab] = useState<"search" | "manual">("search");
  const [searchTitle, setSearchTitle] = useState("");
  const [searchAuthor, setSearchAuthor] = useState("");
  const [manualAsin, setManualAsin] = useState("");
  const [selectedResult, setSelectedResult] = useState<AudibleSearchResult | null>(null);
  const [activeAsin, setActiveAsin] = useState<string | null>(null);

  const debouncedTitle = useDebouncedValue(searchTitle, 500);
  const debouncedAuthor = useDebouncedValue(searchAuthor, 500);

  // Initialize search fields when dialog opens
  useEffect(() => {
    if (open) {
      setSearchTitle(audiobookTitle);
      setSearchAuthor(audiobookAuthor || "");
      setSelectedResult(null);
      setActiveAsin(null);
      setManualAsin("");
    }
  }, [open, audiobookTitle, audiobookAuthor]);

  // Search query
  const searchQuery = useAudibleSearch(debouncedTitle, debouncedAuthor || undefined, {
    enabled: open && tab === "search" && debouncedTitle.length >= 2,
  });

  // Chapters query - fetch when we have an ASIN
  const chaptersQuery = useAudnexusChapters(activeAsin || "", {
    enabled: !!activeAsin,
  });

  // Import mutation
  const importMutation = useImportChapters(audiobookId);

  const handleSelectResult = (result: AudibleSearchResult) => {
    setSelectedResult(result);
    setActiveAsin(result.asin);
  };

  const handleManualAsinSubmit = () => {
    const cleanAsin = manualAsin.trim().toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(cleanAsin)) {
      setActiveAsin(cleanAsin);
      setSelectedResult(null);
    }
  };

  const handleImport = async () => {
    if (!chaptersQuery.data || !activeAsin) return;

    try {
      await importMutation.mutateAsync({
        asin: activeAsin,
        chapters: chaptersQuery.data.chapters,
      });
      toast.success(t("success"));
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    }
  };

  const handleClose = () => {
    setSelectedResult(null);
    setActiveAsin(null);
    setManualAsin("");
    setTab("search");
    onOpenChange(false);
  };

  const fetchedChapters = chaptersQuery.data?.chapters || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "search" | "manual")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">{t("searchTab")}</TabsTrigger>
            <TabsTrigger value="manual">{t("manualTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="flex-1 flex flex-col gap-4 min-h-0 mt-4">
            {/* Search inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="searchTitle">{t("titleLabel")}</Label>
                <Input
                  id="searchTitle"
                  value={searchTitle}
                  onChange={(e) => setSearchTitle(e.target.value)}
                  placeholder={t("titlePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="searchAuthor">{t("authorLabel")}</Label>
                <Input
                  id="searchAuthor"
                  value={searchAuthor}
                  onChange={(e) => setSearchAuthor(e.target.value)}
                  placeholder={t("authorPlaceholder")}
                />
              </div>
            </div>

            {/* Search results */}
            <div className="flex-1 min-h-0">
              {searchQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchQuery.data?.results && searchQuery.data.results.length > 0 ? (
                <div className="h-48 border rounded-md overflow-y-auto">
                  <div className="p-2 space-y-1">
                    {searchQuery.data.results.map((result) => (
                      <button
                        key={result.asin}
                        type="button"
                        onClick={() => handleSelectResult(result)}
                        className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${
                          selectedResult?.asin === result.asin
                            ? "bg-primary/10 border border-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded">
                          {result.coverUrl ? (
                            <Image
                              src={result.coverUrl}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="48px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted">
                              <BookOpen className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{result.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {result.authors.join(", ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ASIN: {result.asin}
                            {result.durationMinutes && (
                              <span className="ml-2">
                                <Clock className="inline h-3 w-3 mr-1" />
                                {Math.floor(result.durationMinutes / 60)}h {result.durationMinutes % 60}m
                              </span>
                            )}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : debouncedTitle.length >= 2 && !searchQuery.isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  {t("noResults")}
                </div>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="manual" className="flex-1 flex flex-col gap-4 min-h-0 mt-4">
            <div className="space-y-2">
              <Label htmlFor="manualAsin">{t("asinLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  id="manualAsin"
                  value={manualAsin}
                  onChange={(e) => setManualAsin(e.target.value.toUpperCase())}
                  placeholder={t("asinPlaceholder")}
                  maxLength={10}
                  className="font-mono"
                />
                <Button
                  onClick={handleManualAsinSubmit}
                  disabled={!/^[A-Z0-9]{10}$/.test(manualAsin.trim().toUpperCase())}
                >
                  <Search className="h-4 w-4 mr-2" />
                  {t("fetch")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("asinHint")}</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Preview panel - shows when we have fetched chapters */}
        {activeAsin && (
          <div className="border-t pt-4 mt-4">
            {chaptersQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">{t("fetchingChapters")}</span>
              </div>
            ) : chaptersQuery.error ? (
              <div className="text-center py-4 text-destructive">
                {chaptersQuery.error instanceof Error
                  ? chaptersQuery.error.message
                  : t("fetchError")}
              </div>
            ) : fetchedChapters.length > 0 ? (
              <>
                <h4 className="font-medium mb-3">{t("preview")}</h4>
                <div className="grid grid-cols-2 gap-4">
                  {/* Current chapters */}
                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-2">
                      {t("currentChapters")} ({currentChapters.length})
                    </h5>
                    <div className="h-48 border rounded-md overflow-y-auto">
                      <div className="p-2 space-y-1">
                        {currentChapters.map((chapter, idx) => (
                          <div
                            key={chapter.id}
                            className="flex items-center justify-between text-sm py-1 px-2"
                          >
                            <span className="truncate flex-1">
                              {idx + 1}. {chapter.title}
                            </span>
                            <span className="text-muted-foreground ml-2 font-mono text-xs">
                              {formatTime(chapter.startTime)}
                            </span>
                          </div>
                        ))}
                        {currentChapters.length === 0 && (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            {t("noCurrentChapters")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fetched chapters */}
                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-2">
                      {t("fetchedChapters")} ({fetchedChapters.length})
                    </h5>
                    <div className="h-48 border rounded-md overflow-y-auto">
                      <div className="p-2 space-y-1">
                        {fetchedChapters.map((chapter, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm py-1 px-2"
                          >
                            <span className="truncate flex-1">
                              {idx + 1}. {chapter.title}
                            </span>
                            <span className="text-muted-foreground ml-2 font-mono text-xs">
                              {formatTime(chapter.startTime)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Duration comparison */}
                {chaptersQuery.data && (
                  <div className="mt-3 text-sm text-muted-foreground">
                    {t("totalDuration")}: {formatTime(chaptersQuery.data.totalDuration)}
                    {!chaptersQuery.data.isAccurate && (
                      <span className="ml-2 text-amber-500">({t("timingApproximate")})</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                {t("noChaptersFound")}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!fetchedChapters.length || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("importing")}
              </>
            ) : (
              t("import")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
