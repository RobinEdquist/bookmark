"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Clock, Trash2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { Label } from "@repo/ui/components/ui/label";
import {
  useComicvineQueueStatus,
  useComicvineDismiss,
  useQueueAllUnlinkedSeries,
  type ComicvineQueueItem,
} from "../../lib/use-comicvine";
import { ComicvineMatchDialog } from "./comicvine-match-dialog";

export function ComicvineQueuePanel() {
  const t = useTranslations("settings.integrations.comicvine.syncQueue");

  const { pendingCount, needsReviewCount, failedCount, items, refetch } =
    useComicvineQueueStatus();
  const { dismissItem } = useComicvineDismiss();
  const { queueAllUnlinkedSeries, isQueueing } = useQueueAllUnlinkedSeries();

  const [matchItem, setMatchItem] = useState<ComicvineQueueItem | null>(null);

  // Force a fresh read on mount — staleTime is Infinity so won't auto-refresh
  useEffect(() => {
    void refetch();
  }, [refetch]);

  const needsReviewItems = items.filter(
    (item) => item.status === "needs_review"
  );
  const failedItems = items.filter((item) => item.status === "failed");

  const handleDismiss = async (id: string) => {
    try {
      await dismissItem(id);
      toast.success(t("toast.dismissed"));
    } catch {
      toast.error(t("toast.dismissFailed"));
    }
  };

  const handleQueueAllUnlinked = async () => {
    try {
      const result = await queueAllUnlinkedSeries();
      toast.success(t("toast.queued", { count: result.queuedCount }));
    } catch (err) {
      if (err instanceof Error && err.message === "COMICVINE_NOT_CONFIGURED") {
        toast.error(t("toast.notConfigured"));
      } else {
        toast.error(t("toast.queueFailed"));
      }
    }
  };

  const allZero = pendingCount === 0 && needsReviewCount === 0 && failedCount === 0;

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{t("title")}</p>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {pendingCount > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t("pending", { count: pendingCount })}
            </Badge>
          )}
          {needsReviewCount > 0 && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              <AlertCircle className="h-3 w-3" />
              {t("needsReview", { count: needsReviewCount })}
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {t("failed", { count: failedCount })}
            </Badge>
          )}
        </div>
      </div>

      {allZero && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}

      {/* Needs review items */}
      {needsReviewItems.length > 0 && (
        <div className="space-y-2">
          <Label>{t("needsReviewLabel")}</Label>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {needsReviewItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {item.title ?? t("untitled")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(item.level === "series" ? "seriesLabel" : "bookLabel")}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMatchItem(item)}
                  >
                    {t("matchNow")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed items */}
      {failedItems.length > 0 && (
        <div className="space-y-2">
          <Label>{t("failedLabel")}</Label>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {failedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {item.title ?? t("untitled")}
                  </p>
                  <p className="text-sm text-destructive truncate">
                    {item.errorMessage ?? t("unknownError")}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMatchItem(item)}
                  >
                    {t("matchNow")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDismiss(item.id)}
                    title={t("dismiss")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queue all unlinked series button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleQueueAllUnlinked}
        disabled={isQueueing}
      >
        {isQueueing ? t("queueing") : t("queueAllUnlinked")}
      </Button>

      {/* Match dialog */}
      {matchItem && (
        <ComicvineMatchDialog
          level={matchItem.level}
          entityId={
            (matchItem.level === "series"
              ? matchItem.seriesId
              : matchItem.bookId) ?? ""
          }
          entityTitle={matchItem.title ?? ""}
          open={!!matchItem}
          onOpenChange={(open) => {
            if (!open) setMatchItem(null);
          }}
          onSuccess={async () => {
            try {
              await dismissItem(matchItem.id);
            } catch {
              // best-effort — dismissItem already invalidates queueStatus
            }
            setMatchItem(null);
          }}
        />
      )}
    </div>
  );
}
