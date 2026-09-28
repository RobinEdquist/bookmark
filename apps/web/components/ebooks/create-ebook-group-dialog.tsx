"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useCreateEbookGroup } from "../../lib/use-ebook-groups";

export function CreateEbookGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("ebooks");
  const router = useRouter();
  const createGroup = useCreateEbookGroup();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setName("");
    setDescription("");
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await createGroup.mutateAsync({
        name: trimmed,
        description: description.trim() ? description.trim() : null,
      });
      toast.success(t("groups.createSuccess"));
      reset();
      onOpenChange(false);
      router.push(`/ebooks/groups/${created.id}`);
    } catch {
      toast.error(t("groups.error"));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("groups.create")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ebook-group-name">{t("groups.name")}</Label>
            <Input
              id="ebook-group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("groups.namePlaceholder")}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ebook-group-description">
              {t("groups.description")}
            </Label>
            <Textarea
              id="ebook-group-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("groups.descriptionPlaceholder")}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createGroup.isPending}
          >
            {t("groups.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={createGroup.isPending || name.trim().length === 0}
          >
            {t("groups.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
