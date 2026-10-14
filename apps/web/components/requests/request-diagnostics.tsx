"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { useRetryImport } from "../../lib/use-import-errors";
import { queryKeys } from "../../lib/query-keys";
import type { RequestDiagnostics as Diagnostics } from "../../lib/use-requests";

export function RequestDiagnostics({ requestId }: { requestId: string }) {
  const t = useTranslations("admin.requests.diagnostics");
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const invalidate = () => {
    client.invalidateQueries({ queryKey: queryKeys.adminRequests.all });
    client.invalidateQueries({ queryKey: queryKeys.requests.all });
  };
  const { data, error, isLoading } = useQuery({
    queryKey: [...queryKeys.adminRequests.all, requestId, "diagnostics"],
    enabled: open,
    refetchInterval: open ? 30_000 : false,
    queryFn: async (): Promise<Diagnostics> => {
      const response = await fetch(
        `/api/admin/requests/${requestId}/diagnostics`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load request diagnostics");
      return response.json();
    },
  });
  const retry = useRetryImport();
  const reconcile = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/admin/requests/${requestId}/reconcile`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error("Reconciliation failed");
    },
    onSuccess: invalidate,
  });
  const recover = async (action: () => Promise<unknown>) => {
    try {
      await action();
      invalidate();
      toast.success(t("queued"));
    } catch {
      toast.error(t("recoveryFailed"));
      invalidate();
    }
  };
  return (
    <details
      className="mt-3 text-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-muted-foreground">
        {t("title")}
      </summary>
      {isLoading && (
        <p className="mt-2" role="status">
          {t("loading")}
        </p>
      )}
      {error && (
        <p className="mt-2 text-destructive" role="alert">
          {t("failed")}
        </p>
      )}
      {data && (
        <div className="mt-2 space-y-2 break-words">
          {data.rawState && <p>{t("sourceState", { state: data.rawState })}</p>}
          {data.submissionReason && <p>{data.submissionReason}</p>}
          {data.importMessage && (
            <p className="text-destructive">{data.importMessage}</p>
          )}
          {data.importPath && (
            <p className="text-xs text-muted-foreground">{data.importPath}</p>
          )}
          {data.importErrorId && data.importStatus !== "resolved" && (
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending || data.importStatus === "retrying"}
              onClick={() =>
                recover(() => retry.mutateAsync(data.importErrorId!))
              }
            >
              {t("retryImport")}
            </Button>
          )}
          {data.canReconcile && (
            <>
              <p className="max-w-prose text-xs text-muted-foreground">
                {t("reconcileDescription")}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={reconcile.isPending}
                onClick={() => recover(() => reconcile.mutateAsync())}
              >
                {t("reconcile")}
              </Button>
            </>
          )}
          {data.activity.issue === "download_error" ||
          data.activity.issue === "download_missing" ? (
            <p className="max-w-prose text-muted-foreground">
              {t("checkClient")}
            </p>
          ) : null}
        </div>
      )}
    </details>
  );
}
