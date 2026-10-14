"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@repo/ui/components/ui/badge";
import type { RequestActivity as Activity } from "../../lib/use-requests";

/** Shared user-safe presentation. Source messages and paths belong to admins. */
export function RequestActivity({ activity }: { activity: Activity }) {
  const t = useTranslations("requests.activity");
  const percentage =
    activity.progress === null ? null : Math.round(activity.progress * 100);
  const hasTransfer = activity.transferState !== null;
  return (
    <div className="space-y-2 pt-2">
      <Badge
        variant={
          activity.stage === "needs_attention" ? "destructive" : "secondary"
        }
      >
        {t(`stage.${activity.stage}`)}
      </Badge>
      {activity.issue && (
        <p className="max-w-prose text-sm text-muted-foreground">
          {t(`issue.${activity.issue}`)}
        </p>
      )}
      {hasTransfer &&
        activity.stage !== "ready" &&
        activity.stage !== "rejected" && (
          <div className="max-w-sm space-y-1">
            <p className="text-xs text-muted-foreground">
              {percentage === null
                ? t("progressUnknown")
                : t("progress", { percentage })}
            </p>
            {percentage !== null && (
              <div
                role="progressbar"
                aria-label={t("downloadProgress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            )}
          </div>
        )}
      {activity.stale && (
        <p className="max-w-prose text-xs text-muted-foreground" role="status">
          {t("stale")}
        </p>
      )}
    </div>
  );
}
