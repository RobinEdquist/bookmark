"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { useDeleteList, type List } from "../../lib/use-lists";

interface DeleteListDialogProps {
  list: List | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteListDialog({
  list,
  open,
  onOpenChange,
  onSuccess,
}: DeleteListDialogProps) {
  const t = useTranslations("lists.deleteDialog");
  const { mutateAsync: deleteList, isPending } = useDeleteList();

  const handleDelete = async () => {
    if (!list) return;

    try {
      await deleteList(list.id);
      toast.success(t("success"));
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error(t("error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">{t("title")}</DialogTitle>
          <DialogDescription className="text-center">
            {t("description", { name: list?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center">
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
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
