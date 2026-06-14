"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useComicSeries, useCreateComicSeries } from "../../lib/use-comics";

interface SeriesPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confirmLabel: string;
  /** Series ids to hide from the list (e.g. the current series). */
  excludeIds?: string[];
  pending?: boolean;
  /** Called with the chosen target series id. */
  onPick: (targetSeriesId: string) => void;
}

export function SeriesPickerDialog({
  open,
  onOpenChange,
  title,
  confirmLabel,
  excludeIds = [],
  pending = false,
  onPick,
}: SeriesPickerDialogProps) {
  const t = useTranslations("comics");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data } = useComicSeries({ search: debounced || undefined, limit: 20 });
  const createSeries = useCreateComicSeries();

  const exclude = new Set(excludeIds);
  const results = (data?.series ?? []).filter((s) => !exclude.has(s.id));

  const handleConfirm = async () => {
    if (!selectedId) return;
    onPick(selectedId);
  };

  const handleCreate = async () => {
    const created = await createSeries.mutateAsync({ title: query.trim() });
    onPick(created.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="series-search">{t("grouping.targetLabel")}</Label>
            <Input
              id="series-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("grouping.searchPlaceholder")}
            />
          </div>

          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selectedId === s.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{s.title}</span>
                  {s.startYear != null && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.startYear}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {query.trim().length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={createSeries.isPending}
              onClick={handleCreate}
            >
              {t("grouping.createNew", { title: query.trim() })}
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("grouping.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!selectedId || pending}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
