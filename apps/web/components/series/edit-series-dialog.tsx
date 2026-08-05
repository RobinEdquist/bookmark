"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { type SeriesDetail, useUpdateSeries } from "../../lib/use-series";

interface EditSeriesDialogProps {
  series: SeriesDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSeriesDialog({
  series,
  open,
  onOpenChange,
}: EditSeriesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <EditSeriesForm series={series} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The form lives in its own component so that its state is created by opening
 * the dialog rather than re-synced afterwards.
 *
 * DialogContent unmounts while closed, so this mounts fresh on every open and
 * useState seeds straight from the current series. The effect this replaces
 * (`if (open) setName(series.name)`) ran a second render immediately after the
 * first on every open, and would also overwrite whatever the user had typed if
 * `series.name` changed underneath them mid-edit.
 */
function EditSeriesForm({
  series,
  onOpenChange,
}: {
  series: SeriesDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("series.detail.editDialog");
  const [name, setName] = useState(series.name);
  const { mutateAsync: updateSeries, isPending } = useUpdateSeries();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    try {
      await updateSeries({
        id: series.id,
        data: {
          name: trimmedName,
        },
      });
      toast.success(t("success"));
      onOpenChange(false);
    } catch {
      toast.error(t("error"));
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
      </DialogHeader>

      <div className="py-4">
        <div className="space-y-2">
          <Label htmlFor="series-name">{t("name")}</Label>
          <Input
            id="series-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("namePlaceholder")}
            disabled={isPending}
            autoFocus
          />
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
  );
}
