"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, Check, X } from "lucide-react";
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
import {
  useHardcoverStatus,
  useHardcoverConnect,
  useHardcoverDisconnect,
  useHardcoverSearch,
} from "../../lib/use-hardcover";

export function IntegrationsSettings() {
  const t = useTranslations("settings.integrations");
  const { isConfigured, isLoading } = useHardcoverStatus();
  const { connect, isConnecting } = useHardcoverConnect();
  const { disconnect, isDisconnecting } = useHardcoverDisconnect();
  const { search, isSearching, searchResult, clearResult } = useHardcoverSearch();

  const [apiKey, setApiKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

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
      await search(searchQuery);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("hardcover.toast.searchFailed")
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
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
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">{t("hardcover.title")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("hardcover.connected")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? t("hardcover.disconnecting") : t("hardcover.disconnect")}
                </Button>
              </div>

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
    </div>
  );
}
