"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, ListMusic, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { useLists, type List } from "../../../lib/use-lists";
import { ListCard } from "../../../components/lists/list-card";
import { CreateListDialog } from "../../../components/lists/create-list-dialog";
import { EditListDialog } from "../../../components/lists/edit-list-dialog";
import { DeleteListDialog } from "../../../components/lists/delete-list-dialog";

export default function ListsPage() {
  const t = useTranslations("lists");
  const { data: lists, isLoading } = useLists();

  const [createOpen, setCreateOpen] = useState(false);
  const [editList, setEditList] = useState<List | null>(null);
  const [deleteList, setDeleteList] = useState<List | null>(null);

  return (
    <div className="flex flex-col p-4 lg:p-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ListMusic className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{t("title")}</h1>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("createList")}
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !lists || lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
            <ListMusic className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="mb-4 text-muted-foreground">{t("noLists")}</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("createFirstList")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                onEdit={setEditList}
                onDelete={setDeleteList}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditListDialog
        list={editList}
        open={!!editList}
        onOpenChange={(open) => !open && setEditList(null)}
      />
      <DeleteListDialog
        list={deleteList}
        open={!!deleteList}
        onOpenChange={(open) => !open && setDeleteList(null)}
      />
    </div>
  );
}
