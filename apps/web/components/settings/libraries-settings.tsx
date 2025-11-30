"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Folder, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
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
import {
  useSettings,
  MetadataSource,
  MetadataFieldPriority,
} from "../../lib/use-settings";

// Define which sources are available for each field
const FIELD_AVAILABLE_SOURCES: Record<keyof MetadataFieldPriority, MetadataSource[]> = {
  title: ["manual", "embedded", "hardcover", "filename"],
  subtitle: ["manual", "embedded", "hardcover"],
  author: ["manual", "embedded", "hardcover", "filename"],
  narrator: ["manual", "embedded"],
  description: ["manual", "embedded", "hardcover"],
  publisher: ["manual", "embedded", "hardcover"],
  publishedDate: ["manual", "embedded", "hardcover"],
  language: ["manual", "embedded"],
  genres: ["manual", "embedded", "hardcover"],
  series: ["manual", "embedded", "hardcover", "filename"],
  seriesOrder: ["manual", "embedded", "hardcover", "filename"],
  cover: ["manual", "embedded", "hardcover", "folder_image"],
};

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

      <FolderPickerDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        onSelect={handleSelectPath}
        initialPath={settings?.libraryPath || undefined}
      />
    </div>
  );
}
