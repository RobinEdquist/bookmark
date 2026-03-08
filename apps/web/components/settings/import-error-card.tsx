"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, Loader2, ChevronDown, ChevronUp, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import {
  useRetryImport,
  useDismissImportError,
  useDeleteImportError,
  type ImportError,
} from "../../lib/use-import-errors";

interface ImportErrorCardProps {
  error: ImportError;
}

function getFileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

export function ImportErrorCard({ error }: ImportErrorCardProps) {
  const t = useTranslations("settings.libraries.importErrors");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { mutate: retry, isPending: isRetrying } = useRetryImport();
  const { mutate: dismiss, isPending: isDismissing } = useDismissImportError();
  const { mutate: deleteError, isPending: isDeleting } = useDeleteImportError();

  const handleRetry = () => {
    retry(error.id, {
      onSuccess: () => {
        toast.success(t("toast.retryQueued"));
      },
      onError: () => {
        toast.error(t("toast.retryFailed"));
      },
    });
  };

  const handleDismiss = () => {
    dismiss(error.id, {
      onSuccess: () => {
        toast.success(t("toast.dismissed"));
      },
      onError: () => {
        toast.error(t("toast.dismissFailed"));
      },
    });
  };

  const handleDelete = () => {
    deleteError(error.id, {
      onSuccess: () => {
        toast.success(t("toast.deleted"));
      },
      onError: () => {
        toast.error(t("toast.deleteFailed"));
      },
    });
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate" title={error.filePath}>
            {getFileName(error.filePath)}
          </p>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {error.errorMessage}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isRetrying || error.status === "retrying"}
          >
            {isRetrying || error.status === "retrying" ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            {isRetrying || error.status === "retrying" ? t("retrying") : t("retry")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            disabled={isDismissing}
            title={t("dismiss")}
          >
            {isDismissing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={isDeleting}
            title={t("delete")}
            className="text-muted-foreground hover:text-destructive"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          {detailsOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {t("details")}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <dl className="space-y-1.5 text-xs">
            <div>
              <dt className="text-muted-foreground">{t("fullPath")}</dt>
              <dd className="font-mono bg-muted px-2 py-1 rounded text-xs break-all mt-0.5">
                {error.filePath}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <div>
                <dt className="text-muted-foreground">{t("attempts")}</dt>
                <dd>{error.attemptCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("firstOccurred")}</dt>
                <dd className="whitespace-nowrap">{formatDate(error.firstOccurredAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("lastOccurred")}</dt>
                <dd className="whitespace-nowrap">{formatDate(error.lastOccurredAt)}</dd>
              </div>
            </div>
            {error.errorDetails?.stack && (
              <div>
                <dt className="text-muted-foreground">{t("stackTrace")}</dt>
                <dd className="mt-0.5">
                  <pre className="bg-muted px-2 py-1 rounded text-xs overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                    {error.errorDetails.stack}
                  </pre>
                </dd>
              </div>
            )}
          </dl>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
