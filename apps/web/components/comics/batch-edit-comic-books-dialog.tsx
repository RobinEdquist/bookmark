"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useUpdateComicBooksBatch } from "../../lib/use-comics";
import type { ComicBookFormat } from "../../lib/use-comics";

const FORMAT_VALUES: ComicBookFormat[] = [
  "single_issue",
  "annual",
  "tpb",
  "omnibus",
  "compendium",
  "one_shot",
  "special",
  "graphic_novel",
  "other",
];

const FORMAT_NONE = "__none__";

interface BatchEditComicBooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  seriesId: string;
  onSuccess?: () => void;
}

export function BatchEditComicBooksDialog({
  open,
  onOpenChange,
  selectedIds,
  seriesId,
  onSuccess,
}: BatchEditComicBooksDialogProps) {
  const t = useTranslations("comics");
  const batchUpdate = useUpdateComicBooksBatch(seriesId);

  const [format, setFormat] = useState<string>(FORMAT_NONE);
  const [ageRating, setAgeRating] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: { format?: ComicBookFormat; ageRating?: string | null } = {};
    if (format !== FORMAT_NONE) data.format = format as ComicBookFormat;
    if (ageRating.trim() !== "") data.ageRating = ageRating.trim();

    if (Object.keys(data).length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      const result = await batchUpdate.mutateAsync({ ids: selectedIds, data });
      toast.success(t("batchEdit.success", { count: result.updated }));
      onSuccess?.();
      onOpenChange(false);
      setFormat(FORMAT_NONE);
      setAgeRating("");
    } catch {
      toast.error(t("batchEdit.error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("batchEdit.title", { count: selectedIds.length })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="batch-format">{t("edit.fields.format")}</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger id="batch-format">
                <SelectValue placeholder={t("batchEdit.noChange")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FORMAT_NONE}>
                  {t("batchEdit.noChange")}
                </SelectItem>
                {FORMAT_VALUES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {t(`format.${f}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="batch-age-rating">
              {t("edit.fields.ageRating")}
            </Label>
            <Input
              id="batch-age-rating"
              value={ageRating}
              onChange={(e) => setAgeRating(e.target.value)}
              placeholder={t("batchEdit.ageRatingPlaceholder")}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("edit.cancel")}
            </Button>
            <Button type="submit" disabled={batchUpdate.isPending}>
              {batchUpdate.isPending
                ? t("edit.saving")
                : t("batchEdit.apply", { count: selectedIds.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
