"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Lock, Globe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { useUpdateList, type List } from "../../lib/use-lists";

interface EditListDialogProps {
  list: List | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditListDialog({ list, open, onOpenChange }: EditListDialogProps) {
  const t = useTranslations("lists.editDialog");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");

  const { mutateAsync: updateList, isPending } = useUpdateList();

  // Sync form with list data when dialog opens
  useEffect(() => {
    if (list && open) {
      setName(list.name);
      setVisibility(list.isPublic ? "public" : "private");
    }
  }, [list, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!list || !name.trim()) return;

    try {
      await updateList({
        id: list.id,
        name: name.trim(),
        isPublic: visibility === "public",
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
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t("name")}</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>{t("visibility")}</Label>
              <RadioGroup
                value={visibility}
                onValueChange={(v) => setVisibility(v as "private" | "public")}
                disabled={isPending}
              >
                <div className="flex items-start space-x-3 rounded-lg border p-3">
                  <RadioGroupItem value="private" id="edit-private" className="mt-0.5" />
                  <div className="flex-1">
                    <Label
                      htmlFor="edit-private"
                      className="flex cursor-pointer items-center gap-2 font-medium"
                    >
                      <Lock className="h-4 w-4" />
                      {t("private")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("privateDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 rounded-lg border p-3">
                  <RadioGroupItem value="public" id="edit-public" className="mt-0.5" />
                  <div className="flex-1">
                    <Label
                      htmlFor="edit-public"
                      className="flex cursor-pointer items-center gap-2 font-medium"
                    >
                      <Globe className="h-4 w-4" />
                      {t("public")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("publicDescription")}
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
