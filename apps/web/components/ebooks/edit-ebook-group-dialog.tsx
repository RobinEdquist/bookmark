"use client";

import { useState } from "react";
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
import {
  useUpdateEbookGroup,
  type EbookGroupDetail,
} from "../../lib/use-ebook-groups";

function EditEbookGroupForm({
  group,
  onOpenChange,
}: {
  group: EbookGroupDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("ebooks");
  const updateGroup = useUpdateEbookGroup();
  const [name, setName] = useState(group.name);
  const [sortName, setSortName] = useState(group.sortName ?? "");
  const [description, setDescription] = useState(group.description ?? "");

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await updateGroup.mutateAsync({
        id: group.id,
        data: {
          name: trimmed,
          sortName: sortName.trim() ? sortName.trim() : null,
          description: description.trim() ? description.trim() : null,
        },
      });
      toast.success(t("groups.updateSuccess"));
      onOpenChange(false);
    } catch {
      toast.error(t("groups.error"));
    }
  };

  return (
    <>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="edit-ebook-group-name">{t("groups.name")}</Label>
          <Input
            id="edit-ebook-group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-ebook-group-sort">{t("groups.sortName")}</Label>
          <Input
            id="edit-ebook-group-sort"
            value={sortName}
            onChange={(event) => setSortName(event.target.value)}
            placeholder={t("groups.sortNamePlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-ebook-group-description">
            {t("groups.description")}
          </Label>
          <Textarea
            id="edit-ebook-group-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={updateGroup.isPending}
        >
          {t("groups.cancel")}
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={updateGroup.isPending || name.trim().length === 0}
        >
          {t("groups.save")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditEbookGroupDialog({
  group,
  open,
  onOpenChange,
}: {
  group: EbookGroupDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("ebooks");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("groups.edit")}</DialogTitle>
        </DialogHeader>
        {open ? (
          <EditEbookGroupForm group={group} onOpenChange={onOpenChange} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
