"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Headphones, BookOpen, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Badge } from "@repo/ui/components/ui/badge";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import type { RequestResponse } from "../../lib/use-requests";

interface MyRequestsListProps {
  requests: RequestResponse[];
  isLoading: boolean;
}

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  downloading: "default",
  complete: "default",
  rejected: "destructive",
};

export function MyRequestsList({ requests, isLoading }: MyRequestsListProps) {
  const t = useTranslations("requests");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">{t("empty.requests")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <Card key={request.id}>
          <CardContent className="p-4">
            <div className="flex gap-4">
              {/* Content Type Icon */}
              <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-lg bg-muted shrink-0">
                {request.contentType === "audiobook" ? (
                  <Headphones className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                ) : (
                  <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold line-clamp-2 sm:line-clamp-1">{request.title}</h3>
                    {request.author && (
                      <p className="text-sm text-muted-foreground truncate">
                        {t("card.by", { author: request.author })}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusVariants[request.status]} className="shrink-0">
                    {t(`status.${request.status}`)}
                  </Badge>
                </div>

                {request.status === "rejected" && request.rejectionReason && (
                  <p className="text-sm text-destructive line-clamp-2">
                    {t("rejectionReason")}: {request.rejectionReason}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  {t("requestedAt", {
                    date: new Date(request.createdAt).toLocaleDateString(),
                  })}
                </p>

                {/* Link to library item if complete */}
                {request.status === "complete" && request.libraryItemId && (
                  <Link
                    href={`/${request.libraryItemType}s/${request.libraryItemId}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {t("viewInLibrary")}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
