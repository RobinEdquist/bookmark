"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Headphones, BookOpen, ChevronRight, Calendar, Tag, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import DOMPurify from "dompurify";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import type { MamSearchResult, ContentType } from "../../lib/use-requests";
import { RequestDetailPanel } from "./request-detail-panel";
import { getCategoryColor, formatCategoryName } from "./category-colors";

interface RequestSearchResultsProps {
  results: MamSearchResult[];
  isLoading: boolean;
  onRequest: (item: {
    mamTorrentId: number;
    title: string;
    author?: string;
    narrator?: string;
    series?: string;
    description?: string;
    contentType: ContentType;
    mamCategory: number;
  }) => void;
  onSupport: (requestId: string) => void;
  isRequesting: boolean;
  isSupporting: boolean;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

export function RequestSearchResults({
  results,
  isLoading,
  onRequest,
  onSupport,
  isRequesting,
  isSupporting,
}: RequestSearchResultsProps) {
  const t = useTranslations("requests");
  const [selectedItem, setSelectedItem] = useState<MamSearchResult | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">{t("empty.search")}</p>
      </div>
    );
  }

  const handleRequest = (item: MamSearchResult) => {
    // Convert series to string for the request (join series names)
    const seriesString = item.series
      ?.map((s) => (s.number ? `${s.name} #${s.number}` : s.name))
      .join(", ");

    onRequest({
      mamTorrentId: item.id,
      title: item.title,
      author: item.author ?? undefined,
      narrator: item.narrator ?? undefined,
      series: seriesString,
      description: item.description ?? undefined,
      contentType: item.contentType,
      mamCategory: item.mamCategory,
    });
  };

  return (
    <>
      <div className="space-y-4">
        {results.map((item) => {
          const isAudiobook = item.contentType === "audiobook";

          return (
            <Card
              key={item.id}
              className="cursor-pointer overflow-hidden transition-colors hover:bg-accent/50"
              onClick={() => setSelectedItem(item)}
            >
              <CardContent className="flex gap-4 p-0">
                {/* Colored accent bar */}
                <div
                  className={`w-1.5 shrink-0 ${
                    isAudiobook ? "bg-primary" : "bg-blue-500"
                  }`}
                />

                {/* Content Type Icon & Category */}
                <div className="my-4 flex shrink-0 flex-col items-center gap-1.5">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-lg ${
                      isAudiobook
                        ? "bg-primary/10 text-primary"
                        : "bg-blue-500/10 text-blue-500"
                    }`}
                  >
                    {isAudiobook ? (
                      <Headphones className="h-7 w-7" />
                    ) : (
                      <BookOpen className="h-7 w-7" />
                    )}
                  </div>
                  {/* Category chip */}
                  {(() => {
                    const categoryName = formatCategoryName(item.category);
                    const colors = getCategoryColor(categoryName);
                    return (
                      <span
                        className={`max-w-[72px] truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}
                        title={categoryName}
                      >
                        {categoryName}
                      </span>
                    );
                  })()}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1 space-y-2 py-4">
                  {/* Title row */}
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{item.title}</h3>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          isAudiobook
                            ? "bg-primary/15 text-primary"
                            : "bg-blue-500/15 text-blue-500"
                        }`}
                      >
                        {isAudiobook ? t("badge.audiobook") : t("badge.ebook")}
                      </span>
                    </div>
                    {item.author && (
                      <p className="truncate text-sm text-muted-foreground">
                        {t("card.by", { author: item.author })}
                      </p>
                    )}
                    {item.narrator && (
                      <p className="truncate text-sm text-muted-foreground">
                        {t("card.narratedBy", { narrator: item.narrator })}
                      </p>
                    )}
                  </div>

                  {/* Series chips - with color */}
                  {item.series && item.series.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.series.map((s, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400"
                        >
                          {s.number ? `${s.name} #${s.number}` : s.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.description && (
                    <p
                      className="line-clamp-2 pr-4 text-sm text-muted-foreground [&_img]:hidden [&_strong]:font-semibold [&_em]:italic"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.description) }}
                    />
                  )}

                  {/* Meta info row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{item.size}</span>
                    <span>{item.language}</span>
                    <span>{item.fileType}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(item.addedDate)}
                    </span>
                  </div>

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Tag className="h-3 w-3 text-muted-foreground" />
                      <div className="flex flex-wrap gap-1">
                        {item.tags.slice(0, 5).map((tag, idx) => (
                          <span key={idx} className="text-xs text-muted-foreground">
                            {tag}
                            {idx < Math.min(item.tags.length, 5) - 1 && ","}
                          </span>
                        ))}
                        {item.tags.length > 5 && (
                          <span className="text-xs text-muted-foreground">
                            +{item.tags.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action */}
                <div className="flex shrink-0 items-center gap-2 pr-4">
                  <AnimatePresence mode="wait">
                    {item.inLibrary ? (
                      <motion.div
                        key={`inlibrary-${item.id}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
                      >
                        <Button variant="outline" disabled size="sm">
                          {t("button.inLibrary")}
                        </Button>
                      </motion.div>
                    ) : item.existingRequestId ? (
                      item.existingRequestStatus === "pending" ? (
                        <motion.div
                          key={`support-${item.id}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSupport(item.existingRequestId!);
                            }}
                            disabled={isSupporting}
                            className="gap-1.5"
                          >
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            {isSupporting ? <LoadingSpinner size="sm" /> : t("button.support")}
                          </Button>
                        </motion.div>
                      ) : (
                        <motion.div
                          key={`status-${item.id}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
                        >
                          <Button variant="outline" disabled size="sm" className="gap-1.5">
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            {t(`status.${item.existingRequestStatus}`)}
                          </Button>
                        </motion.div>
                      )
                    ) : (
                      <motion.div
                        key={`request-${item.id}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
                      >
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRequest(item);
                          }}
                          disabled={isRequesting}
                        >
                          {isRequesting ? <LoadingSpinner size="sm" /> : t("button.request")}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <RequestDetailPanel
        item={selectedItem}
        isOpen={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        onRequest={handleRequest}
        onSupport={onSupport}
        isRequesting={isRequesting}
        isSupporting={isSupporting}
      />
    </>
  );
}
