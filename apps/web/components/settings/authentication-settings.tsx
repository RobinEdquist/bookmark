"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";
import { Switch } from "@repo/ui/components/ui/switch";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { Badge } from "@repo/ui/components/ui/badge";
import { useSettings } from "../../lib/use-settings";
import { useAuthConfig } from "../../lib/use-auth-config";
import { useState, useEffect } from "react";

export function AuthenticationSettings() {
  const t = useTranslations("settings.authentication");
  const { settings, isLoading, error, updateSettings, isUpdating } = useSettings();
  const { data: authConfig } = useAuthConfig();

  const [oidcButtonText, setOidcButtonText] = useState("");

  useEffect(() => {
    if (settings?.oidcButtonText) {
      setOidcButtonText(settings.oidcButtonText);
    }
  }, [settings?.oidcButtonText]);

  const handleSignupsToggle = async (enabled: boolean) => {
    try {
      await updateSettings({ signupsEnabled: enabled });
      toast.success(enabled ? t("signups.enabled") : t("signups.disabled"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("error.updateFailed")
      );
    }
  };

  const handleEmailPasswordToggle = async (enabled: boolean) => {
    try {
      await updateSettings({ emailPasswordEnabled: enabled });
      toast.success(enabled ? t("emailPassword.enabled") : t("emailPassword.disabled"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("error.updateFailed")
      );
    }
  };

  const handleOidcButtonTextSave = async () => {
    if (oidcButtonText === settings?.oidcButtonText) return;
    try {
      await updateSettings({ oidcButtonText });
      toast.success(t("oidc.buttonTextUpdated"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("error.updateFailed")
      );
    }
  };

  const handleAutoCreateChange = async (value: string) => {
    try {
      await updateSettings({ oidcAutoCreateUsers: value });
      toast.success(t("oidc.autoCreateUpdated"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("error.updateFailed")
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
            {t("error.loadFailed")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const oidcEnabled = authConfig?.oidcEnabled ?? false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Signups Toggle */}
          <fieldset className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="signups-enabled" className="text-base font-medium">
                {t("signups.label")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("signups.description")}
              </p>
            </div>
            <Switch
              id="signups-enabled"
              checked={settings?.signupsEnabled ?? false}
              onCheckedChange={handleSignupsToggle}
              disabled={isUpdating}
              aria-describedby="signups-description"
            />
          </fieldset>

          {/* Email/Password Toggle */}
          <fieldset className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="email-password-enabled" className="text-base font-medium">
                {t("emailPassword.label")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("emailPassword.description")}
              </p>
            </div>
            <Switch
              id="email-password-enabled"
              checked={settings?.emailPasswordEnabled ?? true}
              onCheckedChange={handleEmailPasswordToggle}
              disabled={isUpdating || !oidcEnabled}
              aria-describedby="email-password-description"
            />
          </fieldset>
        </CardContent>
      </Card>

      {/* OIDC Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("oidc.title")}</CardTitle>
              <CardDescription>
                {t("oidc.description")}
              </CardDescription>
            </div>
            <Badge variant={oidcEnabled ? "default" : "secondary"}>
              {oidcEnabled ? t("oidc.configured") : t("oidc.notConfigured")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!oidcEnabled ? (
            <p className="text-sm text-muted-foreground">
              {t("oidc.notConfiguredHint")}
            </p>
          ) : (
            <>
              {/* SSO Button Text */}
              <div className="space-y-2">
                <Label htmlFor="oidc-button-text">
                  {t("oidc.buttonText.label")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="oidc-button-text"
                    value={oidcButtonText}
                    onChange={(e) => setOidcButtonText(e.target.value)}
                    placeholder={t("oidc.buttonText.placeholder")}
                    maxLength={50}
                    disabled={isUpdating}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("oidc.buttonText.description")}
                </p>
                {oidcButtonText !== settings?.oidcButtonText && (
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={handleOidcButtonTextSave}
                    disabled={isUpdating}
                  >
                    {t("oidc.buttonText.save")}
                  </button>
                )}
              </div>

              {/* Auto-create Users */}
              <div className="space-y-2">
                <Label htmlFor="oidc-auto-create">
                  {t("oidc.autoCreate.label")}
                </Label>
                <Select
                  value={settings?.oidcAutoCreateUsers ?? "auto"}
                  onValueChange={handleAutoCreateChange}
                  disabled={isUpdating}
                >
                  <SelectTrigger id="oidc-auto-create">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("oidc.autoCreate.auto")}</SelectItem>
                    <SelectItem value="pending">{t("oidc.autoCreate.pending")}</SelectItem>
                    <SelectItem value="disabled">{t("oidc.autoCreate.disabled")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("oidc.autoCreate.description")}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
