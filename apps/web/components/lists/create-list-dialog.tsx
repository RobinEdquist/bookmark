"use client";

import { useState } from "react";
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
import { useCreateList, useAddToList } from "../../lib/use-lists";

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialItem?: {
    itemType: "audiobook" | "ebook";
    itemId: string;
  };
}

export function CreateListDialog({
  open,
  onOpenChange,
  initialItem,
}: CreateListDialogProps) {
  const t = useTranslations("lists.createDialog");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");

  const { mutateAsync: createList, isPending: isCreating } = useCreateList();
  const { mutateAsync: addToList, isPending: isAdding } = useAddToList();

  const isPending = isCreating || isAdding;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      const list = await createList({
        name: name.trim(),
        isPublic: visibility === "public",
      });

      // If there's an initial item, add it to the list
      if (initialItem) {
        await addToList({
          listId: list.id,
          itemType: initialItem.itemType,
          itemId: initialItem.itemId,
        });
      }

      toast.success(t("success"));
      setName("");
      setVisibility("private");
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
              <Label htmlFor="name">{t("name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
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
                  <RadioGroupItem value="private" id="private" className="mt-0.5" />
                  <div className="flex-1">
                    <Label
                      htmlFor="private"
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
                  <RadioGroupItem value="public" id="public" className="mt-0.5" />
                  <div className="flex-1">
                    <Label
                      htmlFor="public"
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
              {isPending ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
