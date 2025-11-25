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
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { useSettings } from "../../lib/use-settings";

export function AuthenticationSettings() {
  const t = useTranslations("settings.authentication");
  const { settings, isLoading, error, updateSettings, isUpdating } = useSettings();

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
      </CardContent>
    </Card>
  );
}
