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
import { toast } from "sonner";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import {
  useInfiniteComicCollections,
  useCreateComicCollection,
  useAddSeriesToCollection,
} from "../../lib/use-comic-collections";

interface AddToCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesIds: string[];
}

export function AddToCollectionDialog({
  open,
  onOpenChange,
  seriesIds,
}: AddToCollectionDialogProps) {
  const t = useTranslations("comics");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);

  const { data } = useInfiniteComicCollections({ search: debounced || undefined });
  const createCollection = useCreateComicCollection();
  const addSeries = useAddSeriesToCollection();

  // Flatten pages into a list
  const collections = data?.pages.flatMap((p) => p.collections) ?? [];

  const handlePick = async (collectionId: string) => {
    try {
      for (const seriesId of seriesIds) {
        await addSeries.mutateAsync({ collectionId, seriesId });
      }
      toast.success(t("collections.addSuccess"));
      onOpenChange(false);
      setQuery("");
    } catch {
      toast.error(t("collections.error"));
    }
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const created = await createCollection.mutateAsync({ name });
      for (const seriesId of seriesIds) {
        await addSeries.mutateAsync({ collectionId: created.id, seriesId });
      }
      toast.success(t("collections.createSuccess"));
      onOpenChange(false);
      setQuery("");
    } catch {
      toast.error(t("collections.error"));
    }
  };

  const isPending = createCollection.isPending || addSeries.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setQuery("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("collections.addTitle", { count: seriesIds.length })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="collection-search">
              {t("collections.namePlaceholder")}
            </Label>
            <Input
              id="collection-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("collections.searchPlaceholder")}
            />
          </div>

          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {collections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => handlePick(c.id)}
                  disabled={isPending}
                  className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("collections.seriesCount", { count: c.seriesCount })}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {query.trim().length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isPending}
              onClick={handleCreate}
            >
              {t("collections.createNew", { name: query.trim() })}
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("collections.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
