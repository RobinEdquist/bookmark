"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Folder } from "lucide-react";
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
import { FolderPickerDialog } from "./folder-picker-dialog";
import { useSettings } from "../../lib/use-settings";

export function LibrariesSettings() {
  const t = useTranslations("settings.libraries");
  const { settings, isLoading, error, updateSettings, isUpdating } = useSettings();
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

  const handleSelectPath = async (path: string) => {
    try {
      await updateSettings({ libraryPath: path });
      toast.success(t("libraryPath.toast.updateSuccess"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("libraryPath.toast.updateError")
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
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <fieldset className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">
                {t("libraryPath.label")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("libraryPath.description")}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <code className="text-sm bg-muted px-2 py-0.5 rounded">
                  {settings?.libraryPath || t("libraryPath.notConfigured")}
                </code>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setFolderPickerOpen(true)}
              disabled={isUpdating}
            >
              {t("libraryPath.browse")}
            </Button>
          </fieldset>
        </CardContent>
      </Card>

      <FolderPickerDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        onSelect={handleSelectPath}
        initialPath={settings?.libraryPath || undefined}
      />
    </>
  );
}
