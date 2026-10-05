"use client";

import { useTranslations } from "next-intl";
import { ChevronDown, EyeOff, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import {
  useHiddenAudiobooks,
  useRestoreHiddenAudiobook,
  type HiddenAudiobook,
} from "../../lib/use-hidden-audiobooks";

/**
 * Audiobooks deleted with "keep files on disk". Scans skip their folders, so
 * without this list there is no way to bring one back. Renders nothing while
 * loading or when nothing is hidden (an optional section shouldn't flash a
 * placeholder), but a failed load says so instead of looking empty.
 */
export function HiddenAudiobooksSection() {
  const t = useTranslations("settings.libraries.audiobookLibrary.hidden");
  const { data, isError, refetch } = useHiddenAudiobooks();
  const restore = useRestoreHiddenAudiobook();

  if (isError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-lg border p-3"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <EyeOff className="h-4 w-4 shrink-0" />
          {t("loadError")}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const handleRestore = (audiobook: HiddenAudiobook) => {
    restore.mutate(audiobook.id, {
      onSuccess: ({ outcome }) => {
        if (outcome === "restored") {
          toast.success(t("toast.restored", { title: audiobook.title }));
        } else {
          toast(t("toast.removed", { title: audiobook.title }));
        }
      },
      onError: () => {
        toast.error(t("toast.error"));
      },
    });
  };

  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-left hover:bg-accent/50 transition-colors rounded-lg">
        <div className="flex items-center gap-2">
          <EyeOff className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("title")}</span>
          <span className="text-sm text-muted-foreground">
            ({items.length})
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 space-y-3">
          <p className="text-sm text-muted-foreground">{t("description")}</p>
          <ul className="divide-y rounded-md border">
            {items.map((audiobook) => {
              const isRestoring =
                restore.isPending && restore.variables === audiobook.id;
              const location = audiobook.folderPath ?? t("rootFile");

              return (
                <li
                  key={audiobook.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {audiobook.title}
                    </p>
                    <p
                      className="text-xs text-muted-foreground truncate"
                      title={location}
                    >
                      {location}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleRestore(audiobook)}
                    disabled={restore.isPending}
                  >
                    {isRestoring ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-1" />
                    )}
                    {isRestoring ? t("restoring") : t("restore")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
