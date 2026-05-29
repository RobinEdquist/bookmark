"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
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
    coverUrl?: string;
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

function stripHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
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
  // Store only ID so panel updates when results change (e.g., after requesting)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  // Derive selected item from results to get latest state
  const selectedItem = selectedItemId !== null
    ? results.find((r) => r.id === selectedItemId) ?? null
    : null;

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
      coverUrl: item.coverUrl ?? undefined,
      contentType: item.contentType,
      mamCategory: item.mamCategory,
    });
  };

  return (
    <>
      <div className="space-y-3 sm:space-y-4">
        {results.map((item) => {
          const isAudiobook = item.contentType === "audiobook";
          const categoryName = formatCategoryName(item.category);
          const categoryColors = getCategoryColor(categoryName);

          return (
            <Card
              key={item.id}
              className="cursor-pointer overflow-hidden transition-colors hover:bg-accent/50"
              onClick={() => setSelectedItemId(item.id)}
            >
              <CardContent className="p-0">
                {/* Desktop Layout (sm+) */}
                <div className="hidden sm:flex gap-4">
                  {/* Colored accent bar */}
                  <div
                    className={`w-1.5 shrink-0 ${
                      isAudiobook ? "bg-primary" : "bg-blue-500"
                    }`}
                  />

                  {/* Cover Image / Content Type Icon & Category */}
                  <div className="my-4 flex shrink-0 flex-col items-center gap-1.5">
                    {item.coverUrl ? (
                      <Image
                        src={item.coverUrl}
                        alt={item.title}
                        width={72}
                        height={72}
                        className="h-[72px] w-[72px] rounded-lg object-cover"
                        unoptimized
                      />
                    ) : (
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
                    )}
                    <span
                      className={`max-w-[72px] truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryColors.bg} ${categoryColors.text}`}
                      title={categoryName}
                    >
                      {categoryName}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1 space-y-2 py-4">
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
                      <p className="line-clamp-2 pr-4 text-sm text-muted-foreground [&_img]:hidden [&_strong]:font-semibold [&_em]:italic">
                        {stripHtml(item.description)}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{item.size}</span>
                      <span>{item.language}</span>
                      <span>{item.fileType}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(item.addedDate)}
                      </span>
                    </div>

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
                </div>

                {/* Mobile Layout */}
                <div className="sm:hidden">
                  <div
                    className={`h-1 w-full ${
                      isAudiobook ? "bg-primary" : "bg-blue-500"
                    }`}
                  />
                  <div className="p-4 space-y-3">
                    {/* Header: Cover/Icon + Title */}
                    <div className="flex items-start gap-3">
                      {item.coverUrl ? (
                        <Image
                          src={item.coverUrl}
                          alt={item.title}
                          width={48}
                          height={48}
                          className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          unoptimized
                        />
                      ) : (
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                            isAudiobook
                              ? "bg-primary/10 text-primary"
                              : "bg-blue-500/10 text-blue-500"
                          }`}
                        >
                          {isAudiobook ? (
                            <Headphones className="h-6 w-6" />
                          ) : (
                            <BookOpen className="h-6 w-6" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <h3 className="font-semibold leading-tight line-clamp-2">{item.title}</h3>
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
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                            {t("card.by", { author: item.author })}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Chips */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${categoryColors.bg} ${categoryColors.text}`}
                      >
                        {categoryName}
                      </span>
                      {item.series && item.series.length > 0 && (
                        <>
                          {item.series.slice(0, 2).map((s, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400"
                            >
                              {s.number ? `${s.name} #${s.number}` : s.name}
                            </span>
                          ))}
                          {item.series.length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{item.series.length - 2}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {stripHtml(item.description)}
                      </p>
                    )}

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{item.size}</span>
                      <span>{item.language}</span>
                      <span>{item.fileType}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(item.addedDate)}
                      </span>
                    </div>

                    {/* Action row */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <AnimatePresence mode="wait">
                        {item.inLibrary ? (
                          <motion.div key={`m-lib-${item.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Button variant="outline" disabled size="sm">{t("button.inLibrary")}</Button>
                          </motion.div>
                        ) : item.existingRequestId ? (
                          item.existingRequestStatus === "pending" ? (
                            <motion.div key={`m-sup-${item.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onSupport(item.existingRequestId!); }} disabled={isSupporting} className="gap-1.5">
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                                {isSupporting ? <LoadingSpinner size="sm" /> : t("button.support")}
                              </Button>
                            </motion.div>
                          ) : (
                            <motion.div key={`m-stat-${item.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <Button variant="outline" disabled size="sm" className="gap-1.5">
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                                {t(`status.${item.existingRequestStatus}`)}
                              </Button>
                            </motion.div>
                          )
                        ) : (
                          <motion.div key={`m-req-${item.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleRequest(item); }} disabled={isRequesting}>
                              {isRequesting ? <LoadingSpinner size="sm" /> : t("button.request")}
                            </Button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <RequestDetailPanel
        item={selectedItem}
        isOpen={selectedItem !== null}
        onClose={() => setSelectedItemId(null)}
        onRequest={handleRequest}
        onSupport={onSupport}
        isRequesting={isRequesting}
        isSupporting={isSupporting}
      />
    </>
  );
}
