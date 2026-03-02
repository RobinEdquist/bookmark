"use client";

import { useEffect, useState } from "react";
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
  const t = useTranslations("series.detail.editDialog");
  const [name, setName] = useState(series.name);
  const { mutateAsync: updateSeries, isPending } = useUpdateSeries();

  useEffect(() => {
    if (open) {
      setName(series.name);
    }
  }, [open, series.name]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
      </DialogContent>
    </Dialog>
  );
}
