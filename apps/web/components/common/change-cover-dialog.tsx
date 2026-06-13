"use client";

import { useCallback } from "react";
import Image from "next/image";
import { Upload, Link, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/ui/tabs";
import {
  useCoverUpload,
  type CoverUploadConfig,
  ALLOWED_TYPES,
} from "../../lib/use-cover-upload";

export type MediaType = "audiobook" | "ebook" | "comic";

export interface ChangeCoverDialogTranslations {
  title: string;
  description: string;
  tabs: {
    upload: string;
    url: string;
  };
  upload: {
    dropzone: string;
    formats: string;
  };
  url: {
    label: string;
    placeholder: string;
    preview: string;
  };
  errors: {
    invalidType: string;
    tooLarge: string;
    invalidUrl: string;
    loadFailed: string;
    failed: string;
  };
  success: string;
  cancel: string;
  save: string;
  saving: string;
}

export interface ChangeCoverDialogProps {
  /** The entity ID (audiobook or ebook) */
  entityId: string;
  /** The entity title for display */
  entityTitle: string;
  /** Current cover URL (for potential future use) */
  currentCoverUrl: string | null;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Media type - affects aspect ratio and API path */
  mediaType: MediaType;
  /** Cover upload configuration */
  uploadConfig: CoverUploadConfig;
  /** Translation strings */
  translations: ChangeCoverDialogTranslations;
}

/**
 * Shared dialog component for changing cover images.
 * Supports both audiobooks (1:1 aspect ratio) and ebooks (2:3 aspect ratio).
 */
export function ChangeCoverDialog({
  entityId,
  entityTitle,
  open,
  onOpenChange,
  mediaType,
  uploadConfig,
  translations: t,
}: ChangeCoverDialogProps) {
  const { state, actions, mutation } = useCoverUpload(uploadConfig);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        actions.resetState();
      }
      onOpenChange(newOpen);
    },
    [actions, onOpenChange]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = actions.handleFileSelect(file);
    if (!result.success && result.error) {
      toast.error(t.errors[result.error as keyof typeof t.errors] || t.errors.failed);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const result = actions.handleDrop(e);
    if (!result.success && result.error) {
      toast.error(t.errors[result.error as keyof typeof t.errors] || t.errors.failed);
    }
  };

  const handlePreviewUrl = () => {
    const result = actions.handlePreviewUrl();
    if (!result.success && result.error) {
      // Error state is set in the hook, no toast needed
    }
  };

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync({ entityId });
      toast.success(t.success);
      handleOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.errors.failed;
      toast.error(message);
    }
  };

  // Different aspect ratios for audiobooks vs ebooks/comics
  const previewClass = mediaType === "ebook" || mediaType === "comic" ? "w-32 h-48" : "w-32 h-32";
  const inputId = `${mediaType}-cover-file-input`;
  const urlInputId = `${mediaType}-cover-url`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>
            {t.description.replace("{title}", entityTitle)}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue="upload"
          value={state.activeTab}
          onValueChange={(v) => actions.setActiveTab(v as "upload" | "url")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              {t.tabs.upload}
            </TabsTrigger>
            <TabsTrigger value="url" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              {t.tabs.url}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDrop={handleDrop}
              onDragOver={actions.handleDragOver}
              onClick={() => document.getElementById(inputId)?.click()}
            >
              {state.previewUrl ? (
                <div className="space-y-3">
                  <div className={`relative ${previewClass} mx-auto`}>
                    <Image
                      src={state.previewUrl}
                      alt="Preview"
                      fill
                      className="object-cover rounded-md"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {state.selectedFile?.name}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">{t.upload.dropzone}</p>
                  <p className="text-xs text-muted-foreground">{t.upload.formats}</p>
                </div>
              )}
              <input
                id={inputId}
                type="file"
                accept={ALLOWED_TYPES.join(",")}
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={urlInputId}>{t.url.label}</Label>
              <div className="flex gap-2">
                <Input
                  id={urlInputId}
                  type="url"
                  placeholder={t.url.placeholder}
                  value={state.urlInput}
                  onChange={(e) => actions.handleUrlChange(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviewUrl}
                  disabled={!state.urlInput.trim() || state.isLoadingPreview}
                >
                  {state.isLoadingPreview ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t.url.preview
                  )}
                </Button>
              </div>
              {state.urlError && (
                <p className="text-sm text-destructive">
                  {t.errors[state.urlError as keyof typeof t.errors] || t.errors.invalidUrl}
                </p>
              )}
            </div>

            {state.urlPreview && (
              <div className="border rounded-lg p-4">
                <div className={`relative ${previewClass} mx-auto`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={state.urlPreview}
                    alt="Preview"
                    className="w-full h-full object-cover rounded-md"
                    onError={() => {
                      actions.handleUrlChange(state.urlInput);
                      toast.error(t.errors.loadFailed);
                    }}
                  />
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={!actions.canSubmit}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t.saving}
              </>
            ) : (
              t.save
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
