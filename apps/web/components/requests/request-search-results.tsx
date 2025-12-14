"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Headphones, BookOpen, ChevronRight, Calendar, Tag } from "lucide-react";
import DOMPurify from "dompurify";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Badge } from "@repo/ui/components/ui/badge";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import type { MamSearchResult, ContentType } from "../../lib/use-requests";
import { RequestDetailPanel } from "./request-detail-panel";

interface RequestSearchResultsProps {
  results: MamSearchResult[];
  isLoading: boolean;
  onRequest: (item: {
    mamTorrentId: string;
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
        {results.map((item) => (
          <Card
            key={item.id}
            className="cursor-pointer transition-colors hover:bg-accent/50"
            onClick={() => setSelectedItem(item)}
          >
            <CardContent className="flex gap-4 p-4">
              {/* Content Type Icon */}
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                {item.contentType === "audiobook" ? (
                  <Headphones className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <BookOpen className="h-8 w-8 text-muted-foreground" />
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{item.title}</h3>
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
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={item.contentType === "audiobook" ? "default" : "secondary"}>
                      {item.contentType === "audiobook" ? t("badge.audiobook") : t("badge.ebook")}
                    </Badge>
                    <Badge variant="outline">{item.category}</Badge>
                  </div>
                </div>

                {/* Series chips */}
                {item.series && item.series.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.series.map((s, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {s.number ? `${s.name} #${s.number}` : s.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {item.description && (
                  <p
                    className="line-clamp-2 text-sm text-muted-foreground [&_img]:hidden [&_strong]:font-semibold [&_em]:italic"
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
              <div className="flex shrink-0 items-center gap-2">
                {item.inLibrary ? (
                  <Button variant="outline" disabled size="sm">
                    {t("button.inLibrary")}
                  </Button>
                ) : item.existingRequestId ? (
                  item.existingRequestStatus === "pending" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSupport(item.existingRequestId!);
                      }}
                      disabled={isSupporting}
                    >
                      {isSupporting ? <LoadingSpinner size="sm" /> : t("button.support")}
                    </Button>
                  ) : (
                    <Button variant="outline" disabled size="sm">
                      {t(`status.${item.existingRequestStatus}`)}
                    </Button>
                  )
                ) : (
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
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
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
