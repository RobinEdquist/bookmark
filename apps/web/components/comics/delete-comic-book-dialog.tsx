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
import { useDeleteComicBook } from "../../lib/use-comics";

interface DeleteComicBookDialogProps {
  bookId: string;
  bookTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete (e.g. to navigate back to the series) */
  onDeleted?: () => void;
}

export function DeleteComicBookDialog({
  bookId,
  bookTitle,
  open,
  onOpenChange,
  onDeleted,
}: DeleteComicBookDialogProps) {
  const t = useTranslations("comics.deleteDialog");
  const [deleteOption, setDeleteOption] = useState<"keep" | "delete">("keep");
  const { mutateAsync: deleteBook, isPending } = useDeleteComicBook();

  const handleDelete = async () => {
    try {
      await deleteBook({
        id: bookId,
        deleteFiles: deleteOption === "delete",
      });
      toast.success(t("bookSuccess"));
      onOpenChange(false);
      onDeleted?.();
    } catch {
      toast.error(t("bookError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t("bookTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { title: bookTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={deleteOption}
            onValueChange={(value: string) =>
              setDeleteOption(value as "keep" | "delete")
            }
            className="space-y-3"
          >
            <div className="flex items-start space-x-3 rounded-lg border p-4">
              <RadioGroupItem value="keep" id="book-keep" className="mt-0.5" />
              <div className="flex-1">
                <Label
                  htmlFor="book-keep"
                  className="flex cursor-pointer items-center gap-2 font-medium"
                >
                  <FolderX className="h-4 w-4" />
                  {t("keepFiles.label")}
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("keepFiles.description")}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 rounded-lg border border-destructive/50 p-4">
              <RadioGroupItem
                value="delete"
                id="book-delete"
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label
                  htmlFor="book-delete"
                  className="flex cursor-pointer items-center gap-2 font-medium text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("deleteFiles.label")}
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
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
