"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, ListMusic, Loader2, Globe } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { useLists, type List } from "../../../lib/use-lists";
import { ListCard } from "../../../components/lists/list-card";
import { CreateListDialog } from "../../../components/lists/create-list-dialog";
import { EditListDialog } from "../../../components/lists/edit-list-dialog";
import { DeleteListDialog } from "../../../components/lists/delete-list-dialog";

export default function ListsPage() {
  const t = useTranslations("lists");
  const { data, isLoading } = useLists();

  const [createOpen, setCreateOpen] = useState(false);
  const [editList, setEditList] = useState<List | null>(null);
  const [deleteList, setDeleteList] = useState<List | null>(null);

  const myLists = data?.myLists ?? [];
  const publicLists = data?.publicLists ?? [];
  const hasNoLists = myLists.length === 0 && publicLists.length === 0;

  return (
    <div className="flex flex-col p-4 lg:p-8">
      <div className="mx-auto w-full max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
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
        ) : hasNoLists ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
            <ListMusic className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="mb-4 text-muted-foreground">{t("noLists")}</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("createFirstList")}
            </Button>
          </div>
        ) : (
          <div className="space-y-10">
            {/* My Lists Section */}
            {myLists.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold">{t("myListsSection")}</h2>
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {myLists.map((list) => (
                    <ListCard
                      key={list.id}
                      list={list}
                      onEdit={setEditList}
                      onDelete={setDeleteList}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Public Lists Section */}
            {publicLists.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{t("publicListsSection")}</h2>
                </div>
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {publicLists.map((list) => (
                    <ListCard
                      key={list.id}
                      list={list}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state for my lists when only public exist */}
            {myLists.length === 0 && publicLists.length > 0 && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
                <p className="mb-3 text-sm text-muted-foreground">{t("noOwnLists")}</p>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t("createFirstList")}
                </Button>
              </div>
            )}
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
