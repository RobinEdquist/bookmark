"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Star, Check } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  useHardcoverSearchPaginated,
  useHardcoverLinkMedia,
  type HardcoverBookDocument,
  type MediaType,
} from "../../lib/use-hardcover";

interface HardcoverSyncDialogProps {
  mediaType: MediaType;
  mediaId: string;
  mediaTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const ITEMS_PER_PAGE = 5;

export function HardcoverSyncDialog({
  mediaType,
  mediaId,
  mediaTitle,
  open,
  onOpenChange,
  onSuccess,
}: HardcoverSyncDialogProps) {
  const t = useTranslations("common.hardcoverSync");
  const [page, setPage] = useState(1);
  const [selectedBook, setSelectedBook] = useState<HardcoverBookDocument | null>(null);

  const { data, isLoading, error } = useHardcoverSearchPaginated(
    mediaType,
    mediaId,
    page,
    ITEMS_PER_PAGE,
    open
  );

  const { linkMedia, isLinking } = useHardcoverLinkMedia();

  const handleSelect = async () => {
    if (!selectedBook) return;

    try {
      await linkMedia({ mediaType, mediaId, hardcoverBook: selectedBook });
      toast.success(t("toast.linked"));
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toast.linkFailed")
      );
    }
  };

  const handleClose = () => {
    setSelectedBook(null);
    setPage(1);
    onOpenChange(false);
  };

  const searchResults = data?.search?.results;
  const totalFound = searchResults?.found ?? 0;
  const totalPages = Math.ceil(totalFound / ITEMS_PER_PAGE);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image
              src="/hardcover.svg"
              alt="Hardcover"
              width={24}
              height={24}
            />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { title: mediaTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" className="text-primary" />
            </div>
          ) : error ? (
            <div className="py-8 text-center text-destructive">
              {error instanceof Error ? error.message : t("error")}
            </div>
          ) : searchResults?.hits.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t("noResults")}
            </div>
          ) : (
            <>
              {/* Results count */}
              <p className="text-sm text-muted-foreground mb-3">
                {t("resultsCount", { count: totalFound })}
              </p>

              {/* Results list */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {searchResults?.hits.map((hit) => {
                  const book = hit.document;
                  const isSelected = selectedBook?.id === book.id;

                  return (
                    <button
                      key={book.id}
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
                        {book.image?.url ? (
                          <Image
                            src={book.image.url}
                            alt={book.title}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-2xl">
                            {mediaType === "audiobook" ? "🎧" : "📖"}
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

                        {book.author_names?.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {book.author_names.join(", ")}
                          </p>
                        )}

                        {book.featured_series?.name && (
                          <p className="text-xs text-primary mt-0.5">
                            {book.featured_series.name}
                            {book.featured_series.position && ` #${book.featured_series.position}`}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-1.5">
                          {book.rating > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {book.rating.toFixed(1)}
                              {book.ratings_count > 0 && (
                                <span className="text-muted-foreground/60">
                                  ({book.ratings_count.toLocaleString()})
                                </span>
                              )}
                            </span>
                          )}

                          {book.genres?.length > 0 && (
                            <span className="text-xs text-muted-foreground line-clamp-1">
                              {book.genres.slice(0, 2).join(", ")}
                            </span>
                          )}
                        </div>
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
          <Button
            onClick={handleSelect}
            disabled={!selectedBook || isLinking}
          >
            {isLinking ? t("linking") : t("link")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
