"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Upload,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Users,
  HardDrive,
  Database,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { useUploadBackup } from "../../../../../lib/use-restore";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export default function UploadPage() {
  const router = useRouter();
  const t = useTranslations("settings.restore");
  const uploadBackup = useUploadBackup();

  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".audiobookshelf")) {
      return t("upload.errors.invalidFileType");
    }
    if (file.size > MAX_FILE_SIZE) {
      return t("upload.errors.fileTooLarge", { maxSize: "500MB" });
    }
    return null;
  };

  const handleFileSelect = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    setSelectedFile(file);
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && files[0]) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && files[0]) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploadProgress(0);

      // Simulate progress for better UX (actual progress would need XHR)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const result = await uploadBackup.mutateAsync(selectedFile);

      clearInterval(progressInterval);
      setUploadProgress(100);

      toast.success(t("upload.success"));

      // Navigate to library selection with session ID
      router.push(`/settings/restore/library?session=${result.session.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("upload.errors.uploadFailed")
      );
      setUploadProgress(0);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
  };

  const isUploading = uploadBackup.isPending;

  const prerequisites = [
    {
      icon: Database,
      title: t("upload.prerequisites.backup.title"),
      description: t("upload.prerequisites.backup.description"),
      important: true,
    },
    {
      icon: FolderOpen,
      title: t("upload.prerequisites.files.title"),
      description: t("upload.prerequisites.files.description"),
      important: true,
    },
    {
      icon: Users,
      title: t("upload.prerequisites.users.title"),
      description: t("upload.prerequisites.users.description"),
      important: false,
    },
    {
      icon: HardDrive,
      title: t("upload.prerequisites.diskSpace.title"),
      description: t("upload.prerequisites.diskSpace.description"),
      important: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Prerequisites Card */}
      <Card className="border-amber-500/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <CardTitle>{t("upload.prerequisites.title")}</CardTitle>
          </div>
          <CardDescription>
            {t("upload.prerequisites.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {prerequisites.map((prereq, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 rounded-lg border p-4 ${
                  prereq.important
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-muted"
                }`}
              >
                <prereq.icon
                  className={`h-5 w-5 shrink-0 mt-0.5 ${
                    prereq.important ? "text-amber-500" : "text-muted-foreground"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{prereq.title}</p>
                    {prereq.important && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {t("upload.prerequisites.required")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {prereq.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick checklist */}
          <div className="mt-6 rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium mb-3">
              {t("upload.prerequisites.checklist.title")}
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="rounded border-muted-foreground" />
                <span>{t("upload.prerequisites.checklist.item1")}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="rounded border-muted-foreground" />
                <span>{t("upload.prerequisites.checklist.item2")}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="rounded border-muted-foreground" />
                <span>{t("upload.prerequisites.checklist.item3")}</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("upload.title")}</CardTitle>
          <CardDescription>{t("upload.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Dropzone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative rounded-lg border-2 border-dashed transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50"
          } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
        >
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center gap-4 p-12 cursor-pointer"
          >
            {selectedFile ? (
              <>
                <FileArchive className="h-12 w-12 text-primary" />
                <div className="text-center space-y-1">
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                {!isUploading && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      handleClearFile();
                    }}
                  >
                    {t("upload.clearFile")}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Upload className="h-12 w-12 text-muted-foreground" />
                <div className="text-center space-y-1">
                  <p className="font-medium">
                    {t("upload.dropzoneTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("upload.dropzoneDescription")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("upload.maxFileSize", { maxSize: "500MB" })}
                  </p>
                </div>
              </>
            )}
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".audiobookshelf"
            onChange={handleFileInputChange}
            disabled={isUploading}
            className="sr-only"
          />
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("upload.uploading")}
              </span>
              <span className="font-medium">{uploadProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

          {/* Info Banner */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium">{t("upload.infoTitle")}</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>{t("upload.infoPoint1")}</li>
              <li>{t("upload.infoPoint2")}</li>
              <li>{t("upload.infoPoint3")}</li>
            </ul>
          </div>

          {/* Upload Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              size="lg"
            >
              {isUploading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  {t("upload.uploading")}
                </>
              ) : (
                t("upload.uploadButton")
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
