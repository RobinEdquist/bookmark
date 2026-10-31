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
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import {
  useInfiniteReadingLists,
  useCreateReadingList,
  useAddToReadingList,
  type ReadingListMediaType,
} from "../../lib/use-reading-lists";

interface AddToReadingListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaType: ReadingListMediaType;
  /** Items to add, in reading order. */
  itemIds: string[];
  onAdded?: () => void;
}

export function AddToReadingListDialog({
  open,
  onOpenChange,
  mediaType,
  itemIds,
  onAdded,
}: AddToReadingListDialogProps) {
  const t = useTranslations("readingLists");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);

  const { data } = useInfiniteReadingLists({
    mediaType,
    search: debounced || undefined,
  });
  const createList = useCreateReadingList();
  const addItems = useAddToReadingList();

  const readingLists = data?.pages.flatMap((p) => p.readingLists) ?? [];
  const isPending = createList.isPending || addItems.isPending;

  const close = () => {
    onOpenChange(false);
    setQuery("");
  };

  const addTo = async (id: string) => {
    const result = await addItems.mutateAsync({ id, itemIds });
    toast.success(t("added", { count: result.added }));
    onAdded?.();
    close();
  };

  const handlePick = async (id: string) => {
    try {
      await addTo(id);
    } catch {
      toast.error(t("error"));
    }
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const created = await createList.mutateAsync({ mediaType, name });
      await addTo(created.id);
    } catch {
      toast.error(t("error"));
    }
  };

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
          <DialogTitle>{t("addTitle", { count: itemIds.length })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="reading-list-search">{t("nameLabel")}</Label>
            <Input
              id="reading-list-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
            />
          </div>

          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {readingLists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => void handlePick(list.id)}
                  disabled={isPending}
                  className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <span className="font-medium">{list.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("issueCount", { count: list.entryCount })}
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
              onClick={() => void handleCreate()}
            >
              {t("createNew", { name: query.trim() })}
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
