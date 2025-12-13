"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { Button } from "@repo/ui/components/ui/button";
import { useTasksStatus } from "../../lib/use-tasks";

export function TasksIndicator() {
  const t = useTranslations("common.tasks");
  const { import: importStatus, hardcoverSync, scan, totalPending, hasTasks, isLoading } = useTasksStatus();

  // Don't render if no tasks and not loading
  if (!hasTasks && !isLoading) {
    return null;
  }

  // Still loading initial data
  if (isLoading && !hasTasks) {
    return null;
  }

  const audiobookImportCount = importStatus.audiobooks.pendingCount;
  const ebookImportCount = importStatus.ebooks.pendingCount;
  const hardcoverPending = hardcoverSync.pendingCount;
  const hardcoverFailed = hardcoverSync.failedCount;

  return (
    <div className="px-4 pb-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="flex-1 text-left text-sm">
              {t("running", { count: totalPending })}
            </span>
            {hardcoverFailed > 0 && (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-72">
          <div className="space-y-4">
            <h4 className="font-medium">{t("title")}</h4>

            {/* Library Scan */}
            {scan.isScanning && (
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("scanningLibrary")}</div>
                <div className="text-sm text-muted-foreground">
                  {scan.phase && t(`scanPhase.${scan.phase}`)}
                  {scan.percentage !== undefined && ` (${scan.percentage}%)`}
                </div>
                {scan.currentFile && (
                  <div className="text-xs text-muted-foreground truncate">
                    {scan.currentFile.split("/").pop()}
                  </div>
                )}
              </div>
            )}

            {/* Audiobook Import Queue */}
            {audiobookImportCount > 0 && (
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("importingAudiobooks")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("audiobooks", { count: audiobookImportCount })}
                </div>
                {importStatus.audiobooks.pendingNames.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {importStatus.audiobooks.pendingNames.slice(0, 3).map((name, index) => (
                      <li key={index} className="truncate">
                        • {name}
                      </li>
                    ))}
                    {importStatus.audiobooks.pendingNames.length > 3 && (
                      <li className="text-muted-foreground/70">
                        +{importStatus.audiobooks.pendingNames.length - 3} {t("more")}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Ebook Import Queue */}
            {ebookImportCount > 0 && (
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("importingEbooks")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("ebooks", { count: ebookImportCount })}
                </div>
                {importStatus.ebooks.pendingNames.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {importStatus.ebooks.pendingNames.slice(0, 3).map((name, index) => (
                      <li key={index} className="truncate">
                        • {name}
                      </li>
                    ))}
                    {importStatus.ebooks.pendingNames.length > 3 && (
                      <li className="text-muted-foreground/70">
                        +{importStatus.ebooks.pendingNames.length - 3} {t("more")}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Hardcover Sync */}
            {(hardcoverPending > 0 || hardcoverFailed > 0) && (
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("hardcoverSync")}</div>
                {hardcoverPending > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {t("pending", { count: hardcoverPending })}
                  </div>
                )}
                {hardcoverFailed > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t("failed", { count: hardcoverFailed })}
                  </div>
                )}
                {hardcoverFailed > 0 && (
                  <Link
                    href="/settings?tab=integrations"
                    className="block text-xs text-primary hover:underline"
                  >
                    {t("viewFailed")}
                  </Link>
                )}
              </div>
            )}

            {/* Empty state - only happens briefly during loading */}
            {!scan.isScanning && audiobookImportCount === 0 && ebookImportCount === 0 && hardcoverPending === 0 && hardcoverFailed === 0 && (
              <div className="text-sm text-muted-foreground">{t("noTasks")}</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
