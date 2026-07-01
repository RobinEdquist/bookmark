"use client";

// Drag-to-reorder is intentionally skipped in v1 (noted in plan Task 13).
// Membership add is handled from the series side (Task 14), not here.

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { ArrowLeft, Pencil, Trash2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { ComicSeriesCard } from "../../../../../components/comics/comic-series-card";
import { DetailHeaderActions } from "../../../../../components/layout/detail-header-actions";
import { useMyPermissions } from "../../../../../lib/use-users";
import {
  useComicCollection,
  useUpdateComicCollection,
  useDeleteComicCollection,
  useRemoveSeriesFromCollection,
} from "../../../../../lib/use-comic-collections";

export default function ComicCollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("comics");
  const router = useRouter();

  const { data: collection, isLoading, error } = useComicCollection(id);
  const { data: permissions } = useMyPermissions();

  const canEdit = permissions?.canEditMetadata ?? false;
  const canDelete = permissions?.canDelete ?? false;

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirm dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);

  const updateCollection = useUpdateComicCollection();
  const deleteCollection = useDeleteComicCollection();
  const removeSeriesFromCollection = useRemoveSeriesFromCollection();

  const handleRenameOpen = () => {
    setRenameValue(collection?.name ?? "");
    setRenameOpen(true);
  };

  const handleRenameSave = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      await updateCollection.mutateAsync({ id, data: { name: trimmed } });
      toast.success(t("collections.createSuccess"));
      setRenameOpen(false);
    } catch {
      toast.error(t("collections.error"));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCollection.mutateAsync(id);
      toast.success(t("collections.deleteSuccess"));
      setDeleteOpen(false);
      router.push("/comics?view=collections");
    } catch {
      toast.error(t("collections.error"));
    }
  };

  const handleRemoveSeries = async (seriesId: string) => {
    try {
      await removeSeriesFromCollection.mutateAsync({ collectionId: id, seriesId });
      toast.success(t("collections.removeSeries"));
    } catch {
      toast.error(t("collections.error"));
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </main>
    );
  }

  if (error || !collection) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{t("collections.error")}</p>
        <Button variant="outline" asChild>
          <Link href="/comics?view=collections">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("collections.tabCollections")}
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/comics?view=collections" aria-label={t("detail.back")}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>

          <div className="flex-1" />

          <DetailHeaderActions
            actions={[
              ...(canEdit
                ? [
                    {
                      key: "edit",
                      label: t("collections.edit"),
                      icon: <Pencil className="h-5 w-5" />,
                      onClick: handleRenameOpen,
                    },
                  ]
                : []),
              ...(canDelete
                ? [
                    {
                      key: "delete",
                      label: t("collections.delete"),
                      icon: <Trash2 className="h-5 w-5" />,
                      onClick: () => setDeleteOpen(true),
                      destructive: true,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Collection title + description */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">{collection.name}</h1>
            {collection.description && (
              <p className="mt-2 text-muted-foreground">{collection.description}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {t("collections.seriesCount", { count: collection.series.length })}
            </p>
          </div>

          {/* Member series grid */}
          {collection.series.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-muted-foreground">{t("collections.empty")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {collection.series.map((series) => (
                <div key={series.id} className="relative group">
                  <ComicSeriesCard series={series} />
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7 rounded-full bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                      onClick={() => handleRemoveSeries(series.id)}
                      title={t("collections.removeSeries")}
                      aria-label={t("collections.removeSeries")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("collections.edit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="collection-name">{t("collections.namePlaceholder")}</Label>
            <Input
              id="collection-name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={t("collections.namePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRenameSave();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameOpen(false)}
              disabled={updateCollection.isPending}
            >
              {t("collections.cancel")}
            </Button>
            <Button
              onClick={() => void handleRenameSave()}
              disabled={updateCollection.isPending || !renameValue.trim()}
            >
              {t("collections.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("collections.delete")}
            </DialogTitle>
            <DialogDescription>
              {t("collections.deleteConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteCollection.isPending}
            >
              {t("collections.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteCollection.isPending}
            >
              {t("collections.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
