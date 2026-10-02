"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { useTranslations } from "next-intl";

interface Attempt {
  id: string;
  torrentId: string;
  status: string;
  createdAt: string;
}

export function RequestAttemptHistory({ requestId }: { requestId: string }) {
  const t = useTranslations("admin.requests.history");
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.adminRequests.all, requestId, "attempts"],
    enabled: open,
    queryFn: async (): Promise<Attempt[]> => {
      const response = await fetch(
        `/api/admin/requests/${requestId}/attempts`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load attempt history");
      return response.json();
    },
    refetchInterval: open ? 30_000 : false,
  });
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
      {data?.length === 0 && (
        <p className="mt-2 text-muted-foreground">{t("empty")}</p>
      )}
      {!!data?.length && (
        <ol className="mt-2 space-y-2">
          {data.map((attempt) => (
            <li key={attempt.id}>
              <span className="font-medium">
                {t(`status.${attempt.status}`)}
              </span>{" "}
              <span className="text-muted-foreground">
                {t("release", { id: attempt.torrentId })} ·{" "}
                {new Date(attempt.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
