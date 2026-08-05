"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ExternalLink,
  Check,
  X,
  AlertCircle,
  Clock,
  Trash2,
  Link as LinkIcon,
  AlertTriangle,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { Switch } from "@repo/ui/components/ui/switch";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  useHardcoverStatus,
  useHardcoverConnect,
  useHardcoverDisconnect,
  useHardcoverSearch,
  useHardcoverAutoSync,
  useHardcoverQueueStatus,
  useHardcoverDismissFailedItem,
  type FailedSyncItem,
} from "../../lib/use-hardcover";
import { HardcoverSyncDialog } from "../hardcover/hardcover-sync-dialog";
import {
  useComicvineStatus,
  useComicvineConnect,
  useComicvineDisconnect,
  useComicvineAutoSync,
} from "../../lib/use-comicvine";
import { ComicvineQueuePanel } from "../comicvine/comicvine-queue-panel";
import {
  useTtsStatus,
  useUpdateTtsConfig,
  useTtsValidate,
  useTtsVoices,
  type TtsValidateResult,
} from "../../lib/use-tts";
import { useSettings } from "../../lib/use-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

export function IntegrationsSettings() {
  const t = useTranslations("settings.integrations");
  const { isConfigured, autoSyncOnImport, isLoading } = useHardcoverStatus();
  const { connect, isConnecting } = useHardcoverConnect();
  const { disconnect, isDisconnecting } = useHardcoverDisconnect();
  const { search, isSearching, searchResult, clearResult } =
    useHardcoverSearch();
  const { setAutoSync, isUpdating: isUpdatingAutoSync } =
    useHardcoverAutoSync();
  const { pendingCount, failedCount, failedItems } = useHardcoverQueueStatus();
  const { dismissItem, isDismissing } = useHardcoverDismissFailedItem();
  const {
    settings,
    updateSettings,
    isUpdating: isUpdatingSettings,
  } = useSettings();

  // ComicVine integration state (distinct names to avoid hardcover collisions)
  const { isConfigured: isCvConfigured, autoSyncOnImport: cvAutoSync } =
    useComicvineStatus();
  const { connect: cvConnect, isConnecting: isCvConnecting } =
    useComicvineConnect();
  const { disconnect: cvDisconnect, isDisconnecting: isCvDisconnecting } =
    useComicvineDisconnect();
  const { setAutoSync: setCvAutoSync, isUpdating: isCvUpdatingAutoSync } =
    useComicvineAutoSync();
  const [cvApiKey, setCvApiKey] = useState("");

  // TTS / AI narration integration state
  const { status: ttsStatus } = useTtsStatus();
  const { updateConfig: updateTtsConfig, isUpdating: isTtsSaving } =
    useUpdateTtsConfig();
  const { validate: validateTts, isValidating: isTtsValidating } =
    useTtsValidate();
  const { voices: savedTtsVoices } = useTtsVoices(
    !!ttsStatus?.configured && !!ttsStatus?.enabled,
  );
  const [ttsBaseUrlDraft, setTtsBaseUrlDraft] = useState<string | null>(null);
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsVoiceDraft, setTtsVoiceDraft] = useState<string | null>(null);
  const [ttsSpeedDraft, setTtsSpeedDraft] = useState<string | null>(null);
  const [ttsModelDraft, setTtsModelDraft] = useState<string | null>(null);
  const [ttsTestResult, setTtsTestResult] = useState<TtsValidateResult | null>(
    null,
  );

  const [apiKey, setApiKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncDialogItem, setSyncDialogItem] = useState<FailedSyncItem | null>(
    null,
  );

  // Category configuration state
  const [audiobookCategoryDraft, setAudiobookCategoryDraft] = useState<
    string | null
  >(null);
  const [ebookCategoryDraft, setEbookCategoryDraft] = useState<string | null>(
    null,
  );
  const [comicsCategoryDraft, setComicsCategoryDraft] = useState<string | null>(
    null,
  );
  const [isSavingCategories, setIsSavingCategories] = useState(false);

  // Auto-approve limit state
  const [autoApproveLimitDraft, setAutoApproveLimitDraft] = useState<
    number | null
  >(null);

  // Every field below shows the saved value until the admin edits it, then their
  // draft. These were two effects that copied the query results into state; each
  // cost an extra render, and a background refetch landing mid-edit would quietly
  // replace whatever had been typed but not yet saved.
  const audiobookCategory =
    audiobookCategoryDraft ?? settings?.requestsAudiobookCategory ?? "";
  const ebookCategory =
    ebookCategoryDraft ?? settings?.requestsEbookCategory ?? "";
  const comicsCategory =
    comicsCategoryDraft ?? settings?.requestsComicsCategory ?? "";
  const autoApproveLimit =
    autoApproveLimitDraft ?? settings?.autoApproveRequestsPerWeek ?? 0;

  const ttsBaseUrl = ttsBaseUrlDraft ?? ttsStatus?.baseUrl ?? "";
  const ttsVoice = ttsVoiceDraft ?? ttsStatus?.voice ?? "af_heart";
  const ttsSpeed =
    ttsSpeedDraft ?? (ttsStatus ? String(ttsStatus.speed) : "1");
  const ttsModel = ttsModelDraft ?? ttsStatus?.model ?? "kokoro";

  const handleTtsEnabledToggle = async (enabled: boolean) => {
    try {
      await updateTtsConfig({ enabled });
      toast.success(enabled ? t("tts.toast.enabled") : t("tts.toast.disabled"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("tts.toast.saveFailed"),
      );
    }
  };

  const handleTtsTest = async () => {
    if (!ttsBaseUrl.trim()) return;
    setTtsTestResult(null);
    try {
      const result = await validateTts({
        baseUrl: ttsBaseUrl.trim(),
        apiKey: ttsApiKey || undefined,
        voice: ttsVoice || undefined,
        model: ttsModel || undefined,
      });
      setTtsTestResult(result);
      if (result.ok) {
        toast.success(
          result.voices
            ? t("tts.toast.testSuccess", { count: result.voices.length })
            : t("tts.toast.testSuccessNoVoices"),
        );
      } else {
        toast.error(result.error || t("tts.toast.testFailed"));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("tts.toast.testFailed"),
      );
    }
  };

  const handleTtsSave = async () => {
    try {
      await updateTtsConfig({
        baseUrl: ttsBaseUrl.trim() || null,
        ...(ttsApiKey ? { apiKey: ttsApiKey } : {}),
        voice: ttsVoice,
        speed: Number.parseFloat(ttsSpeed) || 1.0,
        model: ttsModel || "kokoro",
      });
      setTtsApiKey("");
      toast.success(t("tts.toast.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("tts.toast.saveFailed"),
      );
    }
  };

  const handleConnect = async () => {
    try {
      const result = await connect(apiKey);
      if (result.valid) {
        toast.success(t("hardcover.toast.connected"));
        setApiKey("");
      } else {
        toast.error(result.error || t("hardcover.toast.connectionFailed"));
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("hardcover.toast.connectionFailed"),
      );
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      toast.success(t("hardcover.toast.disconnected"));
      clearResult();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("hardcover.toast.disconnectFailed"),
      );
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      await search({ query: searchQuery });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("hardcover.toast.searchFailed"),
      );
    }
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    try {
      await setAutoSync(enabled);
      toast.success(
        enabled
          ? t("hardcover.toast.autoSyncEnabled")
          : t("hardcover.toast.autoSyncDisabled"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("hardcover.toast.autoSyncFailed"),
      );
    }
  };

  const handleCvConnect = async () => {
    try {
      const result = await cvConnect(cvApiKey);
      if (result.valid) {
        toast.success(t("comicvine.toast.connected"));
        setCvApiKey("");
      } else {
        toast.error(result.error ?? t("comicvine.toast.connectionFailed"));
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("comicvine.toast.connectionFailed"),
      );
    }
  };

  const handleCvDisconnect = async () => {
    try {
      await cvDisconnect();
      toast.success(t("comicvine.toast.disconnected"));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("comicvine.toast.disconnectFailed"),
      );
    }
  };

  const handleCvAutoSyncToggle = async (enabled: boolean) => {
    try {
      await setCvAutoSync(enabled);
      toast.success(
        enabled
          ? t("comicvine.toast.autoSyncEnabled")
          : t("comicvine.toast.autoSyncDisabled"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("comicvine.toast.autoSyncFailed"),
      );
    }
  };

  const handleDismissItem = async (id: string) => {
    try {
      await dismissItem(id);
      toast.success(t("hardcover.syncQueue.toast.dismissed"));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("hardcover.syncQueue.toast.dismissFailed"),
      );
    }
  };

  const handleManualLink = (item: FailedSyncItem) => {
    setSyncDialogItem(item);
  };

  const handleSyncDialogClose = () => {
    setSyncDialogItem(null);
  };

  const handleSyncDialogSuccess = async () => {
    setSyncDialogItem(null);
    // Dismiss the failed item after successful manual link
    if (syncDialogItem) {
      await dismissItem(syncDialogItem.id);
    }
  };

  const handleRequestsToggle = async (enabled: boolean) => {
    try {
      await updateSettings({ requestsEnabled: enabled });
      toast.success(
        enabled ? t("requests.toast.enabled") : t("requests.toast.disabled"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("requests.toast.error"),
      );
    }
  };

  const handleSaveCategories = async () => {
    setIsSavingCategories(true);
    try {
      await updateSettings({
        requestsAudiobookCategory: audiobookCategory,
        requestsEbookCategory: ebookCategory,
        requestsComicsCategory: comicsCategory,
      });
      toast.success(t("requests.categories.toast.success"));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("requests.categories.toast.error"),
      );
    } finally {
      setIsSavingCategories(false);
    }
  };

  const handleFreeleechToggle = async (enabled: boolean) => {
    try {
      await updateSettings({ requestsUseFreeleech: enabled });
      toast.success(
        enabled
          ? t("requests.freeleech.toast.enabled")
          : t("requests.freeleech.toast.disabled"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("requests.toast.error"),
      );
    }
  };

  const handleAutoApproveLimitChange = async (value: number) => {
    const newValue = Math.max(0, value);
    setAutoApproveLimitDraft(newValue);
    try {
      await updateSettings({
        autoApproveRequestsPerWeek: newValue,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("requests.toast.error"),
      );
    }
  };

  if (isLoading || !settings) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <LoadingSpinner size="lg" className="text-primary" />
        </CardContent>
      </Card>
    );
  }

  const requestsDisabled = !settings.trackerClientConfigured;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
      </Card>

      {/* Content Requests */}
      <Card>
        <CardHeader>
          <CardTitle>{t("requests.title")}</CardTitle>
          <CardDescription>{t("requests.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label
                htmlFor="requests-enabled"
                className="text-base font-medium"
              >
                {t("requests.toggle.label")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("requests.toggle.description")}
              </p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Switch
                      id="requests-enabled"
                      checked={settings.requestsEnabled}
                      onCheckedChange={handleRequestsToggle}
                      disabled={requestsDisabled || isUpdatingSettings}
                    />
                  </div>
                </TooltipTrigger>
                {requestsDisabled && (
                  <TooltipContent>
                    <p className="max-w-xs">
                      {t("requests.toggle.disabledTooltip")}
                    </p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </fieldset>

          {requestsDisabled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    {t("requests.warning.title")}
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {t("requests.warning.description")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {settings.requestsEnabled && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-1">
                <Label className="text-base font-medium">
                  {t("requests.categories.title")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("requests.categories.description")}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="audiobook-category">
                    {t("requests.categories.audiobook")}
                  </Label>
                  <Input
                    id="audiobook-category"
                    value={audiobookCategory}
                    onChange={(e) => setAudiobookCategoryDraft(e.target.value)}
                    placeholder="audiobooks"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ebook-category">
                    {t("requests.categories.ebook")}
                  </Label>
                  <Input
                    id="ebook-category"
                    value={ebookCategory}
                    onChange={(e) => setEbookCategoryDraft(e.target.value)}
                    placeholder="books"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comics-category">
                    {t("requests.categories.comics")}
                  </Label>
                  <Input
                    id="comics-category"
                    value={comicsCategory}
                    onChange={(e) => setComicsCategoryDraft(e.target.value)}
                    placeholder="comics"
                  />
                </div>
              </div>

              <Button
                onClick={handleSaveCategories}
                disabled={isSavingCategories}
              >
                {isSavingCategories
                  ? t("requests.categories.saving")
                  : t("requests.categories.save")}
              </Button>

              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="auto-approve-limit">
                  {t("requests.autoApproveLimit")}
                </Label>
                <Input
                  id="auto-approve-limit"
                  type="number"
                  min={0}
                  value={autoApproveLimit}
                  onChange={(e) =>
                    handleAutoApproveLimitChange(parseInt(e.target.value) || 0)
                  }
                />
                <p className="text-sm text-muted-foreground">
                  {t("requests.autoApproveLimitDescription")}
                </p>
              </div>

              <fieldset className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between mt-4">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <Label
                    htmlFor="use-freeleech"
                    className="text-base font-medium"
                  >
                    {t("requests.freeleech.label")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("requests.freeleech.description")}
                  </p>
                </div>
                <Switch
                  id="use-freeleech"
                  checked={settings.requestsUseFreeleech}
                  onCheckedChange={handleFreeleechToggle}
                  disabled={isUpdatingSettings}
                />
              </fieldset>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("hardcover.title")}
              {isConfigured ? (
                <span className="flex items-center gap-1 text-sm font-normal text-green-600">
                  <Check className="h-4 w-4" />
                  {t("hardcover.connected")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                  <X className="h-4 w-4" />
                  {t("hardcover.notConnected")}
                </span>
              )}
            </CardTitle>
            <CardDescription>{t("hardcover.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isConfigured ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">{t("hardcover.apiKeyLabel")}</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={t("hardcover.apiKeyPlaceholder")}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={isConnecting}
                />
                <p className="text-sm text-muted-foreground">
                  {t("hardcover.apiKeyHelp")}{" "}
                  <a
                    href="https://hardcover.app/account/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    hardcover.app/account/api
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
              <Button
                onClick={handleConnect}
                disabled={!apiKey || isConnecting}
              >
                {isConnecting
                  ? t("hardcover.validating")
                  : t("hardcover.saveAndValidate")}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{t("hardcover.title")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("hardcover.connected")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="shrink-0"
                >
                  {isDisconnecting
                    ? t("hardcover.disconnecting")
                    : t("hardcover.disconnect")}
                </Button>
              </div>

              <fieldset className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Label
                      htmlFor="auto-sync-enabled"
                      className="text-base font-medium"
                    >
                      {t("hardcover.autoSync.label")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("hardcover.autoSync.description")}
                    </p>
                  </div>
                  <Switch
                    id="auto-sync-enabled"
                    checked={autoSyncOnImport}
                    onCheckedChange={handleAutoSyncToggle}
                    disabled={isUpdatingAutoSync}
                    aria-describedby="auto-sync-description"
                    className="shrink-0"
                  />
                </div>
                <p className="text-sm text-amber-600 dark:text-amber-500 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {t("hardcover.autoSync.warning")}
                </p>
              </fieldset>

              {/* Sync Queue Status */}
              {(pendingCount > 0 || failedCount > 0) && (
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {t("hardcover.syncQueue.title")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("hardcover.syncQueue.description")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {pendingCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3" />
                          {t("hardcover.syncQueue.pending", {
                            count: pendingCount,
                          })}
                        </Badge>
                      )}
                      {failedCount > 0 && (
                        <Badge
                          variant="destructive"
                          className="flex items-center gap-1"
                        >
                          <AlertCircle className="h-3 w-3" />
                          {t("hardcover.syncQueue.failed", {
                            count: failedCount,
                          })}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Failed Items List */}
                  {failedItems.length > 0 && (
                    <div className="space-y-2">
                      <Label>{t("hardcover.syncQueue.reviewLabel")}</Label>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {failedItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-lg border bg-card p-3"
                          >
                            {item.media?.coverUrl ? (
                              <Image
                                src={item.media.coverUrl}
                                alt={item.media.title}
                                width={48}
                                height={48}
                                className="rounded object-cover"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {item.media?.title ||
                                  t("hardcover.syncQueue.unknownAudiobook")}
                              </p>
                              <p className="text-sm text-destructive truncate">
                                {item.errorMessage ||
                                  t("hardcover.syncQueue.unknownError")}
                              </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleManualLink(item)}
                                title={t("hardcover.syncQueue.linkManually")}
                              >
                                <LinkIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDismissItem(item.id)}
                                disabled={isDismissing}
                                title={t("hardcover.syncQueue.dismiss")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder={t("hardcover.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    disabled={isSearching}
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={!searchQuery.trim() || isSearching}
                  >
                    {isSearching
                      ? t("hardcover.searching")
                      : t("hardcover.search")}
                  </Button>
                </div>

                {searchResult !== null && (
                  <div className="space-y-2">
                    <Label>{t("hardcover.searchResults")}</Label>
                    <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs">
                      {JSON.stringify(searchResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goodreads */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("goodreads.title")}
              <span className="flex items-center gap-1 text-sm font-normal text-green-600">
                <Check className="h-4 w-4" />
                {t("goodreads.builtIn")}
              </span>
            </CardTitle>
            <CardDescription>{t("goodreads.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  {t("goodreads.status.active")}
                </p>
                <p className="text-sm text-green-800 dark:text-green-200">
                  {t("goodreads.status.activeDescription")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comic Vine */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("comicvine.title")}
              {isCvConfigured ? (
                <span className="flex items-center gap-1 text-sm font-normal text-green-600">
                  <Check className="h-4 w-4" />
                  {t("comicvine.connected")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                  <X className="h-4 w-4" />
                  {t("comicvine.notConnected")}
                </span>
              )}
            </CardTitle>
            <CardDescription>{t("comicvine.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isCvConfigured ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cvApiKey">{t("comicvine.apiKeyLabel")}</Label>
                <Input
                  id="cvApiKey"
                  type="password"
                  placeholder={t("comicvine.apiKeyPlaceholder")}
                  value={cvApiKey}
                  onChange={(e) => setCvApiKey(e.target.value)}
                  disabled={isCvConnecting}
                />
                <p className="text-sm text-muted-foreground">
                  {t("comicvine.apiKeyHelp")}{" "}
                  <a
                    href="https://comicvine.gamespot.com/api/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    comicvine.gamespot.com/api
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
              <Button
                onClick={handleCvConnect}
                disabled={!cvApiKey || isCvConnecting}
              >
                {isCvConnecting
                  ? t("comicvine.validating")
                  : t("comicvine.saveAndValidate")}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{t("comicvine.title")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("comicvine.connected")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleCvDisconnect}
                  disabled={isCvDisconnecting}
                  className="shrink-0"
                >
                  {isCvDisconnecting
                    ? t("comicvine.disconnecting")
                    : t("comicvine.disconnect")}
                </Button>
              </div>

              <fieldset className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Label
                      htmlFor="cv-auto-sync-enabled"
                      className="text-base font-medium"
                    >
                      {t("comicvine.autoSync.label")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("comicvine.autoSync.description")}
                    </p>
                  </div>
                  <Switch
                    id="cv-auto-sync-enabled"
                    checked={cvAutoSync}
                    onCheckedChange={handleCvAutoSyncToggle}
                    disabled={isCvUpdatingAutoSync}
                    className="shrink-0"
                  />
                </div>
                <p className="text-sm text-amber-600 dark:text-amber-500 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {t("comicvine.autoSync.warning")}
                </p>
              </fieldset>

              {/* Attribution note — always visible when connected */}
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">
                  {t("comicvine.attribution")}
                </p>
              </div>

              {/* Sync queue panel */}
              <ComicvineQueuePanel />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Text-to-speech / AI narration */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("tts.title")}
              {ttsStatus?.configured ? (
                <span className="flex items-center gap-1 text-sm font-normal text-green-600">
                  <Check className="h-4 w-4" />
                  {t("tts.connected")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                  <X className="h-4 w-4" />
                  {t("tts.notConnected")}
                </span>
              )}
            </CardTitle>
            <CardDescription>{t("tts.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor="tts-enabled" className="text-base font-medium">
                {t("tts.enabled.label")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("tts.enabled.description")}
              </p>
            </div>
            <Switch
              id="tts-enabled"
              checked={ttsStatus?.enabled ?? false}
              onCheckedChange={handleTtsEnabledToggle}
              disabled={isTtsSaving || !ttsStatus}
              className="shrink-0"
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tts-base-url">{t("tts.baseUrlLabel")}</Label>
              <Input
                id="tts-base-url"
                placeholder="http://tts:8880"
                value={ttsBaseUrl}
                onChange={(e) => setTtsBaseUrlDraft(e.target.value)}
                disabled={isTtsSaving}
              />
              <p className="text-sm text-muted-foreground">
                {t("tts.baseUrlHelp")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tts-api-key">{t("tts.apiKeyLabel")}</Label>
              <Input
                id="tts-api-key"
                type="password"
                placeholder={
                  ttsStatus?.apiKeySet
                    ? t("tts.apiKeySetPlaceholder")
                    : t("tts.apiKeyPlaceholder")
                }
                value={ttsApiKey}
                onChange={(e) => setTtsApiKey(e.target.value)}
                disabled={isTtsSaving}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="tts-voice">{t("tts.voiceLabel")}</Label>
                {(ttsTestResult?.voices ?? savedTtsVoices) ? (
                  <Select value={ttsVoice} onValueChange={setTtsVoiceDraft}>
                    <SelectTrigger id="tts-voice">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(ttsTestResult?.voices ?? savedTtsVoices ?? []).map(
                        (voice) => (
                          <SelectItem key={voice} value={voice}>
                            {voice}
                          </SelectItem>
                        ),
                      )}
                      {!(
                        ttsTestResult?.voices ??
                        savedTtsVoices ??
                        []
                      ).includes(ttsVoice) && (
                        <SelectItem value={ttsVoice}>{ttsVoice}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="tts-voice"
                    value={ttsVoice}
                    onChange={(e) => setTtsVoiceDraft(e.target.value)}
                    disabled={isTtsSaving}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tts-speed">{t("tts.speedLabel")}</Label>
                <Select value={ttsSpeed} onValueChange={setTtsSpeedDraft}>
                  <SelectTrigger id="tts-speed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["0.75", "0.9", "1", "1.1", "1.25", "1.5"].map((speed) => (
                      <SelectItem key={speed} value={speed}>
                        {speed}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tts-model">{t("tts.modelLabel")}</Label>
                <Input
                  id="tts-model"
                  value={ttsModel}
                  onChange={(e) => setTtsModelDraft(e.target.value)}
                  disabled={isTtsSaving}
                />
              </div>
            </div>

            {ttsTestResult && !ttsTestResult.ok && (
              <p className="text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {ttsTestResult.error || t("tts.toast.testFailed")}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleTtsTest}
                disabled={!ttsBaseUrl.trim() || isTtsValidating}
              >
                {isTtsValidating ? t("tts.testing") : t("tts.test")}
              </Button>
              <Button onClick={handleTtsSave} disabled={isTtsSaving}>
                {isTtsSaving ? t("tts.saving") : t("tts.save")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Link Dialog */}
      {syncDialogItem?.media && (
        <HardcoverSyncDialog
          mediaType={syncDialogItem.media.type}
          mediaId={syncDialogItem.media.id}
          mediaTitle={syncDialogItem.media.title}
          open={!!syncDialogItem}
          onOpenChange={(open) => !open && handleSyncDialogClose()}
          onSuccess={handleSyncDialogSuccess}
        />
      )}
    </div>
  );
}
