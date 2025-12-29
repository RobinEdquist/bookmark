"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowLeft,
  Lock,
  Globe,
  Loader2,
  Pencil,
  Trash2,
  ListMusic,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  useList,
  useReorderListItems,
  useRemoveFromList,
  type List,
} from "../../../../lib/use-lists";
import { SortableListItem } from "../../../../components/lists/sortable-list-item";
import { EditListDialog } from "../../../../components/lists/edit-list-dialog";
import { DeleteListDialog } from "../../../../components/lists/delete-list-dialog";

interface ListDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ListDetailPage({ params }: ListDetailPageProps) {
  const { id } = use(params);
  const t = useTranslations("lists.detail");
  const router = useRouter();

  const { data: list, isLoading, error } = useList(id);
  const { mutate: reorderItems } = useReorderListItems();
  const { mutateAsync: removeItem, isPending: isRemoving } = useRemoveFromList();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !list?.items) return;

    const oldIndex = list.items.findIndex((item) => item.id === active.id);
    const newIndex = list.items.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(list.items, oldIndex, newIndex);

    reorderItems({
      listId: id,
      itemIds: newOrder.map((item) => item.id),
    });
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removeItem({ listId: id, itemId });
      toast.success(t("itemRemoved"));
    } catch {
      toast.error(t("removeError"));
    }
  };

  const handleDeleteSuccess = () => {
    router.push("/lists");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t("notFound")}</p>
        <Button variant="outline" asChild>
          <Link href="/lists">
            <ArrowLeft className="h-4 w-4" />
            {t("backToLists")}
          </Link>
        </Button>
      </div>
    );
  }

  // Convert to List type for dialogs
  const listForDialog: List = {
    id: list.id,
    userId: list.userId,
    name: list.name,
    isPublic: list.isPublic,
    itemCount: list.items.length,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    isOwner: list.isOwner,
    previewCovers: [],
  };

  return (
    <div className="flex flex-col p-4 lg:p-8">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/lists"
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToLists")}
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{list.name}</h1>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                {list.isPublic ? (
                  <>
                    <Globe className="h-4 w-4" />
                    <span>{t("public")}</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>{t("private")}</span>
                  </>
                )}
                <span>·</span>
                <span>
                  {list.items.length}{" "}
                  {list.items.length === 1 ? t("item") : t("items")}
                </span>
              </div>
            </div>

            {list.isOwner && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  {t("edit")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("deleteList")}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        {list.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
            <ListMusic className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">{t("empty")}</p>
          </div>
        ) : list.isOwner ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={list.items.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {list.items.map((item) => (
                  <SortableListItem
                    key={item.id}
                    item={item}
                    isOwner={list.isOwner}
                    onRemove={!isRemoving ? handleRemoveItem : undefined}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="space-y-2">
            {list.items.map((item) => (
              <SortableListItem
                key={item.id}
                item={item}
                isOwner={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <EditListDialog
        list={editOpen ? listForDialog : null}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteListDialog
        list={deleteOpen ? listForDialog : null}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
}
