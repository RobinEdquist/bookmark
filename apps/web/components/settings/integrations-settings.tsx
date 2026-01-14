"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, Check, X, AlertCircle, Clock, Trash2, Link as LinkIcon, AlertTriangle } from "lucide-react";
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
  const { search, isSearching, searchResult, clearResult } = useHardcoverSearch();
  const { setAutoSync, isUpdating: isUpdatingAutoSync } = useHardcoverAutoSync();
  const { pendingCount, failedCount, failedItems } = useHardcoverQueueStatus();
  const { dismissItem, isDismissing } = useHardcoverDismissFailedItem();
  const { settings, updateSettings, isUpdating: isUpdatingSettings } = useSettings();

  const [apiKey, setApiKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncDialogItem, setSyncDialogItem] = useState<FailedSyncItem | null>(null);

  // Category configuration state
  const [audiobookCategory, setAudiobookCategory] = useState("");
  const [ebookCategory, setEbookCategory] = useState("");
  const [comicsCategory, setComicsCategory] = useState("");
  const [isSavingCategories, setIsSavingCategories] = useState(false);

  // Auto-approve limit state
  const [autoApproveLimit, setAutoApproveLimit] = useState(0);

  // Sync category state when settings load
  useEffect(() => {
    if (settings) {
      setAudiobookCategory(settings.requestsAudiobookCategory);
      setEbookCategory(settings.requestsEbookCategory);
      setComicsCategory(settings.requestsComicsCategory);
      setAutoApproveLimit(settings.autoApproveRequestsPerWeek ?? 0);
    }
  }, [settings]);

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
        err instanceof Error ? err.message : t("hardcover.toast.connectionFailed")
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
        err instanceof Error ? err.message : t("hardcover.toast.disconnectFailed")
      );
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      await search({ query: searchQuery });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("hardcover.toast.searchFailed")
      );
    }
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    try {
      await setAutoSync(enabled);
      toast.success(
        enabled
          ? t("hardcover.toast.autoSyncEnabled")
          : t("hardcover.toast.autoSyncDisabled")
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("hardcover.toast.autoSyncFailed")
      );
    }
  };

  const handleDismissItem = async (id: string) => {
    try {
      await dismissItem(id);
      toast.success(t("hardcover.syncQueue.toast.dismissed"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("hardcover.syncQueue.toast.dismissFailed")
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
        enabled
          ? t("requests.toast.enabled")
          : t("requests.toast.disabled")
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("requests.toast.error")
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
        err instanceof Error ? err.message : t("requests.categories.toast.error")
      );
    } finally {
      setIsSavingCategories(false);
    }
  };

  const handleAutoApproveLimitChange = async (value: number) => {
    const newValue = Math.max(0, value);
    setAutoApproveLimit(newValue);
    try {
      await updateSettings({
        autoApproveRequestsPerWeek: newValue,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("requests.toast.error")
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

  const requestsDisabled = !settings.mamClientConfigured;

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
              <Label htmlFor="requests-enabled" className="text-base font-medium">
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
                    <p className="max-w-xs">{t("requests.toggle.disabledTooltip")}</p>
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
                    onChange={(e) => setAudiobookCategory(e.target.value)}
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
                    onChange={(e) => setEbookCategory(e.target.value)}
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
                    onChange={(e) => setComicsCategory(e.target.value)}
                    placeholder="comics"
                  />
                </div>
              </div>

              <Button
                onClick={handleSaveCategories}
                disabled={isSavingCategories}
              >
                {isSavingCategories ? t("requests.categories.saving") : t("requests.categories.save")}
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
                  onChange={(e) => handleAutoApproveLimitChange(parseInt(e.target.value) || 0)}
                />
                <p className="text-sm text-muted-foreground">
                  {t("requests.autoApproveLimitDescription")}
                </p>
              </div>
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
                {isConnecting ? t("hardcover.validating") : t("hardcover.saveAndValidate")}
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
                  {isDisconnecting ? t("hardcover.disconnecting") : t("hardcover.disconnect")}
                </Button>
              </div>

              <fieldset className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Label htmlFor="auto-sync-enabled" className="text-base font-medium">
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
                      <p className="font-medium">{t("hardcover.syncQueue.title")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("hardcover.syncQueue.description")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {pendingCount > 0 && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t("hardcover.syncQueue.pending", { count: pendingCount })}
                        </Badge>
                      )}
                      {failedCount > 0 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {t("hardcover.syncQueue.failed", { count: failedCount })}
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
                            {item.audiobook?.coverUrl ? (
                              <Image
                                src={item.audiobook.coverUrl}
                                alt={item.audiobook.title}
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
                                {item.audiobook?.title || t("hardcover.syncQueue.unknownAudiobook")}
                              </p>
                              <p className="text-sm text-destructive truncate">
                                {item.errorMessage || t("hardcover.syncQueue.unknownError")}
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
                    {isSearching ? t("hardcover.searching") : t("hardcover.search")}
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

      {/* Goodreads Finder */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("goodreads.title")}
              {settings.grFinderConfigured ? (
                <span className="flex items-center gap-1 text-sm font-normal text-green-600">
                  <Check className="h-4 w-4" />
                  {t("goodreads.configured")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                  <X className="h-4 w-4" />
                  {t("goodreads.notConfigured")}
                </span>
              )}
            </CardTitle>
            <CardDescription>{t("goodreads.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {settings.grFinderConfigured ? (
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
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    {t("goodreads.status.inactive")}
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {t("goodreads.status.inactiveDescription")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Link Dialog */}
      {syncDialogItem?.audiobook && (
        <HardcoverSyncDialog
          mediaType="audiobook"
          mediaId={syncDialogItem.audiobook.id}
          mediaTitle={syncDialogItem.audiobook.title}
          open={!!syncDialogItem}
          onOpenChange={(open) => !open && handleSyncDialogClose()}
          onSuccess={handleSyncDialogSuccess}
        />
      )}
    </div>
  );
}
