"use client";

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
  const { settings, isLoading, error, updateSettings, isUpdating } = useSettings();

  const handleSignupsToggle = async (enabled: boolean) => {
    try {
      await updateSettings({ signupsEnabled: enabled });
      toast.success(enabled ? "Sign-ups enabled" : "Sign-ups disabled");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update settings"
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
    <Card>
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
        <CardDescription>
          Configure how users can access your audiobook vault
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="signups-enabled" className="text-base font-medium">
              Allow Sign-ups
            </Label>
            <p className="text-sm text-muted-foreground">
              When disabled, only existing users can sign in
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
