"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { useUpdateEbookCover } from "../../lib/use-ebooks";

interface ChangeEbookCoverDialogProps {
  ebookId: string;
  ebookTitle: string;
  currentCoverUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ChangeEbookCoverDialog({
  ebookId,
  ebookTitle,
  currentCoverUrl,
  open,
  onOpenChange,
}: ChangeEbookCoverDialogProps) {
  const t = useTranslations("ebooks.changeCover");
  const [activeTab, setActiveTab] = useState<"upload" | "url">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlPreview, setUrlPreview] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const { mutateAsync: updateCover, isPending } = useUpdateEbookCover();

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUrlInput("");
    setUrlPreview(null);
    setUrlError(null);
    setActiveTab("upload");
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(t("errors.invalidType"));
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("errors.tooLarge"));
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(t("errors.invalidType"));
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("errors.tooLarge"));
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handlePreviewUrl = async () => {
    if (!urlInput.trim()) return;

    setIsLoadingPreview(true);
    setUrlError(null);

    try {
      // Basic URL validation
      new URL(urlInput);
      // Just set the URL as preview - actual validation happens on submit
      setUrlPreview(urlInput);
    } catch {
      setUrlError(t("errors.invalidUrl"));
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (activeTab === "upload" && selectedFile) {
        await updateCover({ ebookId, file: selectedFile });
      } else if (activeTab === "url" && urlInput.trim()) {
        await updateCover({ ebookId, url: urlInput.trim() });
      }

      toast.success(t("success"));
      handleOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.failed");
      toast.error(message);
    }
  };

  const canSubmit =
    !isPending &&
    ((activeTab === "upload" && selectedFile) ||
      (activeTab === "url" && urlInput.trim()));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { title: ebookTitle })}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" value={activeTab} onValueChange={(v) => setActiveTab(v as "upload" | "url")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              {t("tabs.upload")}
            </TabsTrigger>
            <TabsTrigger value="url" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              {t("tabs.url")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => document.getElementById("ebook-cover-file-input")?.click()}
            >
              {previewUrl ? (
                <div className="space-y-3">
                  <div className="relative w-32 h-48 mx-auto">
                    <Image
                      src={previewUrl}
                      alt="Preview"
                      fill
                      className="object-cover rounded-md"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">{t("upload.dropzone")}</p>
                  <p className="text-xs text-muted-foreground">{t("upload.formats")}</p>
                </div>
              )}
              <input
                id="ebook-cover-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ebook-cover-url">{t("url.label")}</Label>
              <div className="flex gap-2">
                <Input
                  id="ebook-cover-url"
                  type="url"
                  placeholder={t("url.placeholder")}
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setUrlPreview(null);
                    setUrlError(null);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviewUrl}
                  disabled={!urlInput.trim() || isLoadingPreview}
                >
                  {isLoadingPreview ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("url.preview")
                  )}
                </Button>
              </div>
              {urlError && (
                <p className="text-sm text-destructive">{urlError}</p>
              )}
            </div>

            {urlPreview && (
              <div className="border rounded-lg p-4">
                <div className="relative w-32 h-48 mx-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={urlPreview}
                    alt="Preview"
                    className="w-full h-full object-cover rounded-md"
                    onError={() => {
                      setUrlPreview(null);
                      setUrlError(t("errors.loadFailed"));
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
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t("saving")}
              </>
            ) : (
              t("save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
