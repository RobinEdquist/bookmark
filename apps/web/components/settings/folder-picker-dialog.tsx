"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Folder, ChevronRight, Plus, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { useFilesystemBrowse, useCreateDirectory } from "../../lib/use-filesystem";

interface FolderPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  initialPath?: string;
  title?: string;
  description?: string;
}

export function FolderPickerDialog({
  open,
  onOpenChange,
  onSelect,
  initialPath,
  title,
  description,
}: FolderPickerDialogProps) {
  const t = useTranslations("settings.libraries.folderPicker");
  const [currentPath, setCurrentPath] = useState<string | undefined>(initialPath);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const { data, isLoading, error, refetch } = useFilesystemBrowse(currentPath);
  const createDirectory = useCreateDirectory();

  // Reset to initial path when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentPath(initialPath);
      setShowCreateInput(false);
      setNewFolderName("");
    }
  }, [open, initialPath]);

  // Update currentPath when data is loaded (for initial path resolution)
  useEffect(() => {
    if (data?.currentPath && !currentPath) {
      setCurrentPath(data.currentPath);
    }
  }, [data?.currentPath, currentPath]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setShowCreateInput(false);
    setNewFolderName("");
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !data?.currentPath) return;

    const newPath = `${data.currentPath}/${newFolderName.trim()}`;

    try {
      await createDirectory.mutateAsync(newPath);
      setShowCreateInput(false);
      setNewFolderName("");
      refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("error.create")
      );
    }
  };

  const handleSelect = () => {
    if (data?.currentPath) {
      onSelect(data.currentPath);
      onOpenChange(false);
    }
  };

  // Build breadcrumb segments
  const breadcrumbs = data?.currentPath
    ? data.currentPath.split("/").filter(Boolean)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? t("title")}</DialogTitle>
          <DialogDescription>{description ?? t("description")}</DialogDescription>
        </DialogHeader>

        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-1 text-sm overflow-x-auto py-2">
          <button
            onClick={() => handleNavigate("/")}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            /
          </button>
          {breadcrumbs.map((segment, index) => {
            const path = "/" + breadcrumbs.slice(0, index + 1).join("/");
            const isLast = index === breadcrumbs.length - 1;
            return (
              <div key={path} className="flex items-center gap-1 shrink-0">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <button
                  onClick={() => handleNavigate(path)}
                  className={
                    isLast
                      ? "font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  {segment}
                </button>
              </div>
            );
          })}
        </div>

        {/* Directory listing */}
        <div className="border rounded-lg max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive">
              {t("error.browse")}
            </div>
          ) : (
            <>
              {/* Parent directory */}
              {data?.parentPath && (
                <button
                  onClick={() => handleNavigate(data.parentPath!)}
                  className="w-full flex items-center gap-2 p-3 hover:bg-muted text-left border-b"
                >
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">..</span>
                </button>
              )}

              {/* Directories */}
              {data?.directories.map((dir) => (
                <button
                  key={dir.path}
                  onClick={() => handleNavigate(dir.path)}
                  className="w-full flex items-center gap-2 p-3 hover:bg-muted text-left border-b last:border-b-0"
                >
                  <Folder className="h-4 w-4 text-primary" />
                  <span>{dir.name}</span>
                </button>
              ))}

              {/* Empty state */}
              {data?.directories.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {t("emptyFolder")}
                </div>
              )}
            </>
          )}
        </div>

        {/* Create folder section */}
        {showCreateInput ? (
          <div className="flex gap-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t("createFolderPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") {
                  setShowCreateInput(false);
                  setNewFolderName("");
                }
              }}
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || createDirectory.isPending}
            >
              {createDirectory.isPending ? t("creating") : t("createFolder")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowCreateInput(false);
                setNewFolderName("");
              }}
            >
              {t("cancel")}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateInput(true)}
            className="w-fit"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("createFolder")}
          </Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSelect} disabled={!data?.currentPath}>
            {t("select")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
