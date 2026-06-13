"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import Link from "next/link";
import { Folder, ChevronUp, ChevronDown, Headphones, BookOpen, BookImage, X, Rss, Copy, Check, Upload, Link2, RefreshCw, ScanLine } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { Progress } from "@repo/ui/components/ui/progress";
import { Switch } from "@repo/ui/components/ui/switch";
import { FolderPickerDialog } from "./folder-picker-dialog";
import { ImportErrorsSection } from "./import-errors-section";
import {
  useSettings,
  MetadataSource,
  MetadataFieldPriority,
} from "../../lib/use-settings";
import { useHardcoverStatus, useQueueAllUnlinked } from "../../lib/use-hardcover";
import { useRescan, useRescanStatus } from "../../lib/use-rescan";

// Fields that make sense to show in the UI
// Note: genres is excluded because it always combines all sources
// Note: publisher is excluded as it's rarely needed
const CONFIGURABLE_FIELDS: (keyof MetadataFieldPriority)[] = [
  "title",
  "subtitle",
  "author",
  "narrator",
  "description",
  "series",
];

interface PriorityItemProps {
  field: keyof MetadataFieldPriority;
  sources: MetadataSource[];
  onMove: (field: keyof MetadataFieldPriority, sourceIndex: number, direction: "up" | "down") => void;
  t: ReturnType<typeof useTranslations>;
  isUpdating: boolean;
}

function PriorityItem({ field, sources, onMove, t, isUpdating }: PriorityItemProps) {
  // Filter out 'manual' since it's always first (handled separately in backend)
  const configurableSources = sources.filter((s) => s !== "manual");

  return (
    <div className="rounded-lg border p-3">
      <div className="font-medium text-sm mb-2">
        {t(`metadataPriority.fields.${field}`)}
      </div>
      <div className="space-y-1">
        {/* Manual edit is always first - show as fixed */}
        <div className="flex items-center gap-2 bg-primary/10 rounded px-2 py-1 text-sm">
          <span className="text-xs text-muted-foreground w-4">1.</span>
          <span className="flex-1">{t("metadataPriority.sources.manual")}</span>
          <span className="text-xs text-muted-foreground">{t("metadataPriority.alwaysFirst")}</span>
        </div>
        {configurableSources.map((source, index) => (
          <div
            key={source}
            className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1 text-sm"
          >
            <span className="text-xs text-muted-foreground w-4">{index + 2}.</span>
            <span className="flex-1">{t(`metadataPriority.sources.${source}`)}</span>
            <div className="flex gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={index === 0 || isUpdating}
                onClick={() => onMove(field, index, "up")}
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={index === configurableSources.length - 1 || isUpdating}
                onClick={() => onMove(field, index, "down")}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LibrariesSettings() {
  const t = useTranslations("settings.libraries");
  const tRestore = useTranslations("settings.restore");
  const { settings, isLoading, error, updateSettings, isUpdating } = useSettings();
  const [audiobookFolderPickerOpen, setAudiobookFolderPickerOpen] = useState(false);
  const [ebookFolderPickerOpen, setEbookFolderPickerOpen] = useState(false);
  const [comicFolderPickerOpen, setComicFolderPickerOpen] = useState(false);
  const [isEbookScanning, setIsEbookScanning] = useState(false);
  const [isComicScanning, setIsComicScanning] = useState(false);
  const [opdsCopied, setOpdsCopied] = useState(false);
  const { isConfigured: hardcoverConfigured } = useHardcoverStatus();
  const { queueAllUnlinked } = useQueueAllUnlinked();
  const [isQueueingAudiobooks, setIsQueueingAudiobooks] = useState(false);
  const [isQueueingEbooks, setIsQueueingEbooks] = useState(false);
  const { rescan, isRescanPending } = useRescan();
  const rescanStatus = useRescanStatus();

  const handleSelectAudiobookPath = async (path: string) => {
    try {
      await updateSettings({ audiobookLibraryPath: path });
      toast.success(t("audiobookLibrary.toast.updateSuccess"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("audiobookLibrary.toast.updateError")
      );
    }
  };

  const handleSelectEbookPath = async (path: string) => {
    try {
      await updateSettings({ ebookLibraryPath: path });
      toast.success(t("ebookLibrary.toast.updateSuccess"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("ebookLibrary.toast.updateError")
      );
    }
  };

  const handleRemoveAudiobookPath = async () => {
    try {
      await updateSettings({ audiobookLibraryPath: null });
      toast.success(t("audiobookLibrary.toast.removeSuccess"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("audiobookLibrary.toast.removeError")
      );
    }
  };

  const handleRemoveEbookPath = async () => {
    try {
      await updateSettings({ ebookLibraryPath: null });
      toast.success(t("ebookLibrary.toast.removeSuccess"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("ebookLibrary.toast.removeError")
      );
    }
  };

  const handleScanEbooks = async () => {
    setIsEbookScanning(true);
    try {
      const response = await fetch("/api/admin/library-watcher/scan-ebooks", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || t("ebookLibrary.toast.scanError"));
      }
      const data = (await response.json()) as { success: boolean; result: { succeeded: number; failed: number } };
      toast.success(t("ebookLibrary.toast.scanSuccess", { succeeded: data.result.succeeded, failed: data.result.failed }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("ebookLibrary.toast.scanError"));
    } finally {
      setIsEbookScanning(false);
    }
  };

  const handleSelectComicPath = async (path: string) => {
    try {
      await updateSettings({ comicLibraryPath: path });
      toast.success(t("comicLibrary.toast.updateSuccess"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("comicLibrary.toast.updateError")
      );
    }
  };

  const handleRemoveComicPath = async () => {
    try {
      await updateSettings({ comicLibraryPath: null });
      toast.success(t("comicLibrary.toast.removeSuccess"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("comicLibrary.toast.removeError")
      );
    }
  };

  const handleScanComics = async () => {
    setIsComicScanning(true);
    try {
      const response = await fetch("/api/admin/library-watcher/scan-comics", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || t("comicLibrary.toast.scanError"));
      }
      const data = (await response.json()) as { success: boolean; result: { succeeded: number; failed: number } };
      toast.success(t("comicLibrary.toast.scanSuccess", { succeeded: data.result.succeeded, failed: data.result.failed }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("comicLibrary.toast.scanError"));
    } finally {
      setIsComicScanning(false);
    }
  };

  const handleToggleOpds = async (enabled: boolean) => {
    try {
      await updateSettings({ opdsEnabled: enabled });
      toast.success(enabled ? t("opds.toast.enabled") : t("opds.toast.disabled"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("opds.toast.error")
      );
    }
  };

  const handleCopyOpdsUrl = async () => {
    const url = `${window.location.origin}/api/ebooks/opds`;
    await navigator.clipboard.writeText(url);
    setOpdsCopied(true);
    setTimeout(() => setOpdsCopied(false), 2000);
    toast.success(t("opds.toast.copied"));
  };

  const handleMoveSource = useCallback(
    async (field: keyof MetadataFieldPriority, sourceIndex: number, direction: "up" | "down") => {
      if (!settings?.metadataPriority) return;

      const newPriority = { ...settings.metadataPriority };
      const allSources = [...newPriority[field]];

      // Filter out 'manual' to work with the same array as the UI
      const configurableSources = allSources.filter((s) => s !== "manual");
      const newIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;

      // Swap the items in the filtered array - check bounds
      if (newIndex < 0 || newIndex >= configurableSources.length) return;
      const temp = configurableSources[sourceIndex];
      configurableSources[sourceIndex] = configurableSources[newIndex]!;
      configurableSources[newIndex] = temp!;

      // Reconstruct the full array with 'manual' at the start (if it was present)
      const hadManual = allSources.includes("manual");
      newPriority[field] = hadManual ? ["manual", ...configurableSources] : configurableSources;

      try {
        await updateSettings({ metadataPriority: newPriority });
        toast.success(t("metadataPriority.toast.updateSuccess"));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("metadataPriority.toast.updateError")
        );
      }
    },
    [settings?.metadataPriority, updateSettings, t]
  );

  const handleQueueAllAudiobooks = async () => {
    if (!hardcoverConfigured) {
      toast.error(t("hardcoverLinking.toast.notConfigured"));
      return;
    }
    setIsQueueingAudiobooks(true);
    try {
      const result = await queueAllUnlinked("audiobook");
      toast.success(t("hardcoverLinking.toast.queuedAudiobooks", { count: result.queuedCount }));
    } catch (err) {
      if (err instanceof Error && err.message === "HARDCOVER_NOT_CONFIGURED") {
        toast.error(t("hardcoverLinking.toast.notConfigured"));
      } else {
        toast.error(t("hardcoverLinking.toast.error"));
      }
    } finally {
      setIsQueueingAudiobooks(false);
    }
  };

  const handleQueueAllEbooks = async () => {
    if (!hardcoverConfigured) {
      toast.error(t("hardcoverLinking.toast.notConfigured"));
      return;
    }
    setIsQueueingEbooks(true);
    try {
      const result = await queueAllUnlinked("ebook");
      toast.success(t("hardcoverLinking.toast.queuedEbooks", { count: result.queuedCount }));
    } catch (err) {
      if (err instanceof Error && err.message === "HARDCOVER_NOT_CONFIGURED") {
        toast.error(t("hardcoverLinking.toast.notConfigured"));
      } else {
        toast.error(t("hardcoverLinking.toast.error"));
      }
    } finally {
      setIsQueueingEbooks(false);
    }
  };

  const handleRescan = async () => {
    try {
      const result = await rescan();
      toast.success(
        t("rescan.toast.completed", {
          succeeded: result.result.succeeded,
          failed: result.result.failed,
        })
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("rescan.toast.error")
      );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <LoadingSpinner size="lg" className="text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <p className="text-destructive">
            Failed to load settings. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Import Errors */}
          <ImportErrorsSection />

          {/* Audiobook Library Path */}
          <fieldset className="rounded-lg border p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Headphones className="h-4 w-4 shrink-0" />
                    {t("audiobookLibrary.label")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("audiobookLibrary.description")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {settings?.audiobookLibraryPath && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRemoveAudiobookPath}
                      disabled={isUpdating}
                      title={t("audiobookLibrary.remove")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setAudiobookFolderPickerOpen(true)}
                    disabled={isUpdating}
                  >
                    {t("audiobookLibrary.browse")}
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Folder className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <code className="text-sm bg-muted px-2 py-0.5 rounded break-all">
                  {settings?.audiobookLibraryPath || t("audiobookLibrary.notConfigured")}
                </code>
              </div>
            </div>
          </fieldset>

          {/* Ebook Library Path */}
          <fieldset className="rounded-lg border p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <BookOpen className="h-4 w-4 shrink-0" />
                    {t("ebookLibrary.label")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("ebookLibrary.description")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {settings?.ebookLibraryPath && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRemoveEbookPath}
                      disabled={isUpdating}
                      title={t("ebookLibrary.remove")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setEbookFolderPickerOpen(true)}
                    disabled={isUpdating}
                  >
                    {t("ebookLibrary.browse")}
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Folder className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <code className="text-sm bg-muted px-2 py-0.5 rounded break-all">
                  {settings?.ebookLibraryPath || t("ebookLibrary.notConfigured")}
                </code>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScanEbooks}
                  disabled={isEbookScanning || !settings?.ebookLibraryPath}
                >
                  {isEbookScanning ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      {t("ebookLibrary.scanning")}
                    </>
                  ) : (
                    <>
                      <ScanLine className="mr-2 h-4 w-4" />
                      {t("ebookLibrary.scan")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </fieldset>

          {/* Comic Library Path */}
          <fieldset className="rounded-lg border p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <BookImage className="h-4 w-4 shrink-0" />
                    {t("comicLibrary.label")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("comicLibrary.description")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {settings?.comicLibraryPath && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRemoveComicPath}
                      disabled={isUpdating}
                      title={t("comicLibrary.remove")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setComicFolderPickerOpen(true)}
                    disabled={isUpdating}
                  >
                    {t("comicLibrary.browse")}
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Folder className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <code className="text-sm bg-muted px-2 py-0.5 rounded break-all">
                  {settings?.comicLibraryPath || t("comicLibrary.notConfigured")}
                </code>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScanComics}
                  disabled={isComicScanning || !settings?.comicLibraryPath}
                >
                  {isComicScanning ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      {t("comicLibrary.scanning")}
                    </>
                  ) : (
                    <>
                      <ScanLine className="mr-2 h-4 w-4" />
                      {t("comicLibrary.scan")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </fieldset>

          {/* OPDS Feed */}
          <fieldset className="rounded-lg border p-4 space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Rss className="h-4 w-4 shrink-0" />
                  {t("opds.label")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("opds.description")}
                </p>
              </div>
              <Switch
                checked={settings?.opdsEnabled ?? false}
                onCheckedChange={handleToggleOpds}
                disabled={isUpdating || !settings?.ebookLibraryPath}
                className="shrink-0"
              />
            </div>

            {settings?.opdsEnabled && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-sm text-muted-foreground">{t("opds.feedUrl")}</Label>
                <div className="flex items-start gap-2">
                  <code className="flex-1 text-sm bg-muted px-3 py-2 rounded break-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/api/ebooks/opds` : '/api/ebooks/opds'}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyOpdsUrl}
                    title={t("opds.copy")}
                    className="shrink-0"
                  >
                    {opdsCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("opds.authHint")}
                </p>
              </div>
            )}
          </fieldset>
        </CardContent>
      </Card>

      {/* Metadata Priority Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t("metadataPriority.title")}</CardTitle>
          <CardDescription>{t("metadataPriority.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {settings?.metadataPriority && CONFIGURABLE_FIELDS.map((field) => (
              <PriorityItem
                key={field}
                field={field}
                sources={settings.metadataPriority[field]}
                onMove={handleMoveSource}
                t={t}
                isUpdating={isUpdating}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Hardcover Linking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t("hardcoverLinking.title")}
          </CardTitle>
          <CardDescription>{t("hardcoverLinking.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleQueueAllAudiobooks}
              disabled={isQueueingAudiobooks || isQueueingEbooks}
            >
              {isQueueingAudiobooks ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  {t("hardcoverLinking.linkingAudiobooks")}
                </>
              ) : (
                <>
                  <Headphones className="mr-2 h-4 w-4" />
                  {t("hardcoverLinking.linkAllAudiobooks")}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleQueueAllEbooks}
              disabled={isQueueingAudiobooks || isQueueingEbooks}
            >
              {isQueueingEbooks ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  {t("hardcoverLinking.linkingEbooks")}
                </>
              ) : (
                <>
                  <BookOpen className="mr-2 h-4 w-4" />
                  {t("hardcoverLinking.linkAllEbooks")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rescan Metadata Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {t("rescan.title")}
          </CardTitle>
          <CardDescription>{t("rescan.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rescanStatus.isRescanning && (
            <div className="space-y-2">
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
                <span className="text-muted-foreground break-words">
                  {rescanStatus.currentAudiobook
                    ? t("rescan.progress.current", { title: rescanStatus.currentAudiobook })
                    : t("rescan.progress.preparing")}
                </span>
                <span className="font-medium shrink-0">
                  {rescanStatus.processed ?? 0} / {rescanStatus.total ?? 0}
                </span>
              </div>
              <Progress value={rescanStatus.percentage ?? 0} />
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleRescan}
              disabled={isRescanPending || rescanStatus.isRescanning || !settings?.audiobookLibraryPath}
            >
              {rescanStatus.isRescanning ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  {t("rescan.inProgress")}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("rescan.button")}
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("rescan.hint")}
          </p>
        </CardContent>
      </Card>

      {/* Restore from AudioBookShelf Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {tRestore("title")}
          </CardTitle>
          <CardDescription>{tRestore("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/settings/restore">
              <Upload className="mr-2 h-4 w-4" />
              {tRestore("title")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <FolderPickerDialog
        open={audiobookFolderPickerOpen}
        onOpenChange={setAudiobookFolderPickerOpen}
        onSelect={handleSelectAudiobookPath}
        initialPath={settings?.audiobookLibraryPath || '/library/audiobooks'}
        title={t("folderPicker.audiobookTitle")}
        description={t("folderPicker.audiobookDescription")}
      />
      <FolderPickerDialog
        open={ebookFolderPickerOpen}
        onOpenChange={setEbookFolderPickerOpen}
        onSelect={handleSelectEbookPath}
        initialPath={settings?.ebookLibraryPath || '/library/ebooks'}
        title={t("folderPicker.ebookTitle")}
        description={t("folderPicker.ebookDescription")}
      />
      <FolderPickerDialog
        open={comicFolderPickerOpen}
        onOpenChange={setComicFolderPickerOpen}
        onSelect={handleSelectComicPath}
        initialPath={settings?.comicLibraryPath || '/library/comics'}
        title={t("folderPicker.comicTitle")}
        description={t("folderPicker.comicDescription")}
      />
    </div>
  );
}
