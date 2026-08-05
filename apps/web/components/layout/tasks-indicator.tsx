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
import { useDismissGoodreadsLinkFailures } from "../../lib/use-goodreads";

export function TasksIndicator() {
  const t = useTranslations("common.tasks");
  const {
    import: importStatus,
    hardcoverSync,
    scan,
    tts,
    goodreadsLink,
    totalPending,
    hasTasks,
    isLoading,
  } = useTasksStatus();
  const { dismissFailures, isDismissing } = useDismissGoodreadsLinkFailures();

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
  const comicImportCount = importStatus.comics.pendingCount;
  const hardcoverPending = hardcoverSync.pendingCount;
  const hardcoverFailed = hardcoverSync.failedCount;
  const ttsActive = tts.active;
  const ttsPending = tts.pendingCount;
  const ttsFailed = tts.failedCount;
  const goodreadsActive = goodreadsLink.active;
  const goodreadsPending = goodreadsLink.pendingCount;
  const goodreadsFailed = goodreadsLink.failedCount;
  const anyFailed = hardcoverFailed > 0 || ttsFailed > 0 || goodreadsFailed > 0;

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
            {anyFailed && (
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
                <div className="text-sm font-medium">
                  {t("scanningLibrary")}
                </div>
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
                <div className="text-sm font-medium">
                  {t("importingAudiobooks")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("audiobooks", { count: audiobookImportCount })}
                </div>
                {importStatus.audiobooks.pendingNames.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {importStatus.audiobooks.pendingNames
                      .slice(0, 3)
                      .map((name, index) => (
                        <li key={index} className="truncate">
                          • {name}
                        </li>
                      ))}
                    {importStatus.audiobooks.pendingNames.length > 3 && (
                      <li className="text-muted-foreground/70">
                        +{importStatus.audiobooks.pendingNames.length - 3}{" "}
                        {t("more")}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Ebook Import Queue */}
            {ebookImportCount > 0 && (
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {t("importingEbooks")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("ebooks", { count: ebookImportCount })}
                </div>
                {importStatus.ebooks.pendingNames.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {importStatus.ebooks.pendingNames
                      .slice(0, 3)
                      .map((name, index) => (
                        <li key={index} className="truncate">
                          • {name}
                        </li>
                      ))}
                    {importStatus.ebooks.pendingNames.length > 3 && (
                      <li className="text-muted-foreground/70">
                        +{importStatus.ebooks.pendingNames.length - 3}{" "}
                        {t("more")}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Comic Import Queue */}
            {comicImportCount > 0 && (
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {t("importingComics")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("comics", { count: comicImportCount })}
                </div>
                {importStatus.comics.pendingNames.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {importStatus.comics.pendingNames
                      .slice(0, 3)
                      .map((name, index) => (
                        <li key={index} className="truncate">
                          • {name}
                        </li>
                      ))}
                    {importStatus.comics.pendingNames.length > 3 && (
                      <li className="text-muted-foreground/70">
                        +{importStatus.comics.pendingNames.length - 3}{" "}
                        {t("more")}
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

            {/* TTS Audiobook Generation */}
            {(ttsActive || ttsPending > 0 || ttsFailed > 0) && (
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("tts.title")}</div>
                {ttsActive ? (
                  <>
                    <div className="text-sm text-muted-foreground truncate">
                      {t("tts.generatingFor", { title: ttsActive.ebookTitle })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {ttsActive.phase === "generating" &&
                      ttsActive.totalChapters !== null ? (
                        <>
                          {t("tts.chapterProgress", {
                            completed: ttsActive.completedChapters,
                            total: ttsActive.totalChapters,
                          })}
                          {ttsActive.percentage !== null &&
                            ` (${ttsActive.percentage}%)`}
                        </>
                      ) : (
                        t(`tts.phase.${ttsActive.phase}`)
                      )}
                    </div>
                    {ttsActive.phase === "generating" &&
                      ttsActive.currentChapterTitle && (
                        <div className="text-xs text-muted-foreground truncate">
                          {ttsActive.currentChapterTitle}
                        </div>
                      )}
                  </>
                ) : null}
                {ttsPending > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {t("tts.pending", { count: ttsPending })}
                  </div>
                )}
                {ttsFailed > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t("tts.failed", { count: ttsFailed })}
                  </div>
                )}
              </div>
            )}

            {/* Goodreads Linking */}
            {(goodreadsActive ||
              goodreadsPending > 0 ||
              goodreadsFailed > 0) && (
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {t("goodreadsLink.title")}
                </div>
                {goodreadsActive && (
                  <div className="text-sm text-muted-foreground truncate">
                    {t("goodreadsLink.linking", {
                      title: goodreadsActive.bookTitle,
                    })}
                  </div>
                )}
                {goodreadsPending > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {t("goodreadsLink.pending", { count: goodreadsPending })}
                  </div>
                )}
                {goodreadsFailed > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("goodreadsLink.failed", { count: goodreadsFailed })}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {goodreadsLink.failures.slice(0, 3).map((failure) => (
                        <li key={failure.jobId} className="truncate">
                          • {failure.bookTitle}
                        </li>
                      ))}
                      {goodreadsLink.failures.length > 3 && (
                        <li className="text-muted-foreground/70">
                          +{goodreadsLink.failures.length - 3} {t("more")}
                        </li>
                      )}
                    </ul>
                    <button
                      type="button"
                      onClick={() => void dismissFailures()}
                      disabled={isDismissing}
                      className="block text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      {t("goodreadsLink.dismiss")}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Empty state - only happens briefly during loading */}
            {!scan.isScanning &&
              audiobookImportCount === 0 &&
              ebookImportCount === 0 &&
              comicImportCount === 0 &&
              hardcoverPending === 0 &&
              hardcoverFailed === 0 &&
              !ttsActive &&
              ttsPending === 0 &&
              ttsFailed === 0 &&
              !goodreadsActive &&
              goodreadsPending === 0 &&
              goodreadsFailed === 0 && (
                <div className="text-sm text-muted-foreground">
                  {t("noTasks")}
                </div>
              )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
