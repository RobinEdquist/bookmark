"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Check, ListPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import {
  useListsForItem,
  useAddToList,
  useRemoveFromList,
} from "../../lib/use-lists";
import { CreateListDialog } from "./create-list-dialog";

interface AddToListDialogProps {
  itemType: "audiobook" | "ebook";
  itemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddToListDialog({
  itemType,
  itemId,
  open,
  onOpenChange,
}: AddToListDialogProps) {
  const t = useTranslations("lists.addToList");
  const [createOpen, setCreateOpen] = useState(false);
  const [processingListId, setProcessingListId] = useState<string | null>(null);

  const { data: lists, isLoading } = useListsForItem(itemType, itemId);
  const { mutateAsync: addToList } = useAddToList();
  const { mutateAsync: removeFromList } = useRemoveFromList();

  const handleToggleList = async (
    listId: string,
    isInList: boolean,
    listItemId: string | null
  ) => {
    setProcessingListId(listId);
    try {
      if (isInList && listItemId) {
        await removeFromList({ listId, itemId: listItemId });
        toast.success(t("removed"));
      } else {
        await addToList({ listId, itemType, itemId });
        toast.success(t("added"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setProcessingListId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="h-5 w-5" />
              {t("title")}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !lists || lists.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t("noLists")}
              </div>
            ) : (
              <div className="space-y-2 pr-4">
                {lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() =>
                      handleToggleList(list.id, list.containsItem, list.listItemId)
                    }
                    disabled={processingListId === list.id}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{list.name}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        ({list.itemCount})
                      </span>
                    </div>
                    {processingListId === list.id ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : list.containsItem ? (
                      <Check className="h-5 w-5 text-primary" />
                    ) : (
                      <Plus className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          <Button
            variant="outline"
            onClick={() => setCreateOpen(true)}
            className="w-full"
          >
            <Plus className="h-4 w-4" />
            {t("createNew")}
          </Button>
        </DialogContent>
      </Dialog>

      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialItem={{ itemType, itemId }}
      />
    </>
  );
}
