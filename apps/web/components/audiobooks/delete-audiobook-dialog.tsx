"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Trash2, FolderX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { useDeleteAudiobook } from "../../lib/use-audiobooks";

interface DeleteAudiobookDialogProps {
  audiobookId: string;
  audiobookTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAudiobookDialog({
  audiobookId,
  audiobookTitle,
  open,
  onOpenChange,
}: DeleteAudiobookDialogProps) {
  const t = useTranslations("audiobooks.deleteDialog");
  const [deleteOption, setDeleteOption] = useState<"keep" | "delete">("keep");
  const { mutateAsync: deleteAudiobook, isPending } = useDeleteAudiobook();

  const handleDelete = async () => {
    try {
      await deleteAudiobook({
        id: audiobookId,
        deleteFiles: deleteOption === "delete",
      });
      toast.success(t("success"));
      onOpenChange(false);
    } catch {
      toast.error(t("error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { title: audiobookTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={deleteOption}
            onValueChange={(value: string) => setDeleteOption(value as "keep" | "delete")}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3 rounded-lg border p-4">
              <RadioGroupItem value="keep" id="keep" className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="keep" className="flex items-center gap-2 font-medium cursor-pointer">
                  <FolderX className="h-4 w-4" />
                  {t("keepFiles.label")}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("keepFiles.description")}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 rounded-lg border border-destructive/50 p-4">
              <RadioGroupItem value="delete" id="delete" className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="delete" className="flex items-center gap-2 font-medium cursor-pointer text-destructive">
                  <Trash2 className="h-4 w-4" />
                  {t("deleteFiles.label")}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("deleteFiles.description")}
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? t("deleting") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
