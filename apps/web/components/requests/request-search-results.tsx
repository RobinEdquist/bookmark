"use client";

import { useTranslations } from "next-intl";
import { Headphones, BookOpen } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Badge } from "@repo/ui/components/ui/badge";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import type { MamSearchResult, ContentType } from "../../lib/use-requests";

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
  }) => void;
  onSupport: (requestId: string) => void;
  isRequesting: boolean;
  isSupporting: boolean;
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

  return (
    <div className="space-y-4">
      {results.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex gap-4 p-4">
            {/* Content Type Icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
              {item.contentType === "audiobook" ? (
                <Headphones className="h-8 w-8 text-muted-foreground" />
              ) : (
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  {item.author && (
                    <p className="text-sm text-muted-foreground">
                      {t("card.by", { author: item.author })}
                    </p>
                  )}
                  {item.narrator && (
                    <p className="text-sm text-muted-foreground">
                      {t("card.narratedBy", { narrator: item.narrator })}
                    </p>
                  )}
                  {item.series && (
                    <p className="text-sm text-muted-foreground">
                      {t("card.series", { series: item.series })}
                    </p>
                  )}
                </div>
                <Badge variant={item.contentType === "audiobook" ? "default" : "secondary"}>
                  {item.contentType === "audiobook" ? t("badge.audiobook") : t("badge.ebook")}
                </Badge>
              </div>

              {item.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {item.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{item.size}</span>
                <span>{item.language}</span>
                <span>{item.fileType}</span>
              </div>
            </div>

            {/* Action */}
            <div className="flex items-center">
              {item.inLibrary ? (
                <Button variant="outline" disabled>
                  {t("button.inLibrary")}
                </Button>
              ) : item.existingRequestId ? (
                item.existingRequestStatus === "pending" ? (
                  <Button
                    variant="outline"
                    onClick={() => onSupport(item.existingRequestId!)}
                    disabled={isSupporting}
                  >
                    {isSupporting ? <LoadingSpinner size="sm" /> : t("button.support")}
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    {t(`status.${item.existingRequestStatus}`)}
                  </Button>
                )
              ) : (
                <Button
                  onClick={() =>
                    onRequest({
                      mamTorrentId: item.id,
                      title: item.title,
                      author: item.author ?? undefined,
                      narrator: item.narrator ?? undefined,
                      series: item.series ?? undefined,
                      description: item.description ?? undefined,
                      contentType: item.contentType,
                    })
                  }
                  disabled={isRequesting}
                >
                  {isRequesting ? <LoadingSpinner size="sm" /> : t("button.request")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
