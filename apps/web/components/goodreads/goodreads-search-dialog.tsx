"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Star, Check, Search, LinkIcon } from "lucide-react";
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
  useGrFinderSearch,
  useGoodreadsLinkMedia,
  type GrFinderSearchResult,
  type MediaType,
} from "../../lib/use-goodreads";

interface GoodreadsSearchDialogProps {
  mediaType: MediaType;
  mediaId: string;
  mediaTitle: string;
  initialQuery: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function GoodreadsSearchDialog({
  mediaType,
  mediaId,
  mediaTitle,
  initialQuery,
  open,
  onOpenChange,
  onSuccess,
}: GoodreadsSearchDialogProps) {
  const t = useTranslations("common.goodreadsSearch");
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [selectedBook, setSelectedBook] = useState<GrFinderSearchResult | null>(null);

  // Auto-search on initial query change (when dialog opens)
  useEffect(() => {
    if (open && initialQuery) {
      setSearchInput(initialQuery);
      setActiveQuery(initialQuery);
    }
  }, [open, initialQuery]);

  const { data, isLoading, error } = useGrFinderSearch(activeQuery, open);
  const { linkMedia, isLinking } = useGoodreadsLinkMedia();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setActiveQuery(searchInput.trim());
      setSelectedBook(null);
    }
  };

  const handleClose = () => {
    setSelectedBook(null);
    setSearchInput(initialQuery);
    setActiveQuery(initialQuery);
    onOpenChange(false);
  };

  const handleLink = async () => {
    if (!selectedBook) return;

    try {
      await linkMedia({
        mediaType,
        mediaId,
        goodreadsId: selectedBook.goodreads_id,
      });
      toast.success(t("toast.linked"));
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toast.linkFailed")
      );
    }
  };

  const results = data?.results ?? [];
  const totalCount = data?.count ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image
              src="/goodreads.svg"
              alt="Goodreads"
              width={24}
              height={24}
              className="dark:invert"
            />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { title: mediaTitle })}
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
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
          <Button type="submit" variant="secondary" disabled={isLoading || !searchInput.trim()}>
            {t("search")}
          </Button>
        </form>

        <div className="flex-1 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" className="text-primary" />
            </div>
          ) : error ? (
            <div className="py-8 text-center text-destructive">
              {error instanceof Error ? error.message : t("error")}
            </div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t("noResults")}
            </div>
          ) : (
            <>
              {/* Results count */}
              <p className="text-sm text-muted-foreground mb-3">
                {t("resultsCount", { count: totalCount })}
              </p>

              {/* Results list */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {results.map((book) => {
                  const isSelected = selectedBook?.goodreads_id === book.goodreads_id;

                  return (
                    <button
                      key={book.goodreads_id}
                      type="button"
                      onClick={() => setSelectedBook(book)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      {/* Cover image */}
                      <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded bg-muted">
                        {book.cover_url ? (
                          <Image
                            src={book.cover_url}
                            alt={book.title}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-2xl">
                            📚
                          </div>
                        )}
                      </div>

                      {/* Book info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-sm line-clamp-2">
                            {book.title}
                          </h3>
                          {isSelected && (
                            <Check className="h-5 w-5 text-primary flex-shrink-0" />
                          )}
                        </div>

                        {book.author && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {book.author}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-1.5">
                          {book.avg_rating && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {book.avg_rating}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isLinking}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleLink}
            disabled={!selectedBook || isLinking}
          >
            <LinkIcon className="h-4 w-4 mr-2" />
            {isLinking ? t("linking") : t("link")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
