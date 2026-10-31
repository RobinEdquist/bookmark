"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
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
import { Textarea } from "@repo/ui/components/ui/textarea";
import { DetailHeaderActions } from "../layout/detail-header-actions";
import { GeneratedCover } from "../common/generated-cover";
import { useMyPermissions } from "../../lib/use-users";
import {
  useDeleteReadingList,
  useMoveReadingListItem,
  useReadingList,
  useRemoveFromReadingList,
  useUpdateReadingList,
  type ReadingListEntry,
} from "../../lib/use-reading-lists";

interface ReadingListDetailProps {
  id: string;
  /** Where the back arrow and a deleted list go. */
  backHref: string;
  /** Where an entry the library has links to. */
  itemHref: (entry: ReadingListEntry) => string;
}

export function ReadingListDetail({
  id,
  backHref,
  itemHref,
}: ReadingListDetailProps) {
  const t = useTranslations("readingLists");
  const router = useRouter();
  const { data: list, isLoading, error } = useReadingList(id);
  const { data: permissions } = useMyPermissions();
  const canEdit = permissions?.canEditMetadata ?? false;
  const canDelete = permissions?.canDelete ?? false;

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const updateList = useUpdateReadingList();
  const deleteList = useDeleteReadingList();
  const moveItem = useMoveReadingListItem();
  const removeItem = useRemoveFromReadingList();

  const openEdit = () => {
    setName(list?.name ?? "");
    setDescription(list?.description ?? "");
    setEditOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await updateList.mutateAsync({
        id,
        data: { name: trimmed, description: description.trim() || null },
      });
      toast.success(t("saved"));
      setEditOpen(false);
    } catch {
      toast.error(t("error"));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteList.mutateAsync(id);
      toast.success(t("deleted"));
      setDeleteOpen(false);
      router.push(backHref, { scroll: false });
    } catch {
      toast.error(t("error"));
    }
  };

  // Positions are places in the whole list, which can hold items this
  // viewer does not see; moving onto a neighbour's position steps past it.
  const handleMove = async (
    entry: ReadingListEntry,
    to: ReadingListEntry | undefined,
  ) => {
    if (!to) return;
    try {
      await moveItem.mutateAsync({
        id,
        itemId: entry.id,
        position: to.position,
      });
    } catch {
      toast.error(t("error"));
    }
  };

  const handleRemove = async (entry: ReadingListEntry) => {
    try {
      await removeItem.mutateAsync({ id, itemId: entry.id });
      toast.success(t("removed"));
    } catch {
      toast.error(t("error"));
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </main>
    );
  }

  if (error || !list) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{t("error")}</p>
        <Button variant="outline" asChild>
          <Link href={backHref} scroll={false}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
      </main>
    );
  }

  const busy = moveItem.isPending || removeItem.isPending;
  const total = list.entries.length;

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={backHref} scroll={false} aria-label={t("back")}>
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
                      label: t("edit"),
                      icon: <Pencil className="h-5 w-5" />,
                      onClick: openEdit,
                    },
                  ]
                : []),
              ...(canDelete
                ? [
                    {
                      key: "delete",
                      label: t("delete"),
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

      <div className="mx-auto max-w-4xl px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">{list.name}</h1>
            {list.description && (
              <p className="mt-2 whitespace-pre-line text-muted-foreground">
                {list.description}
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {t("issueCount", { count: total })}
              {list.missingCount > 0 &&
                ` · ${t("missingCount", { count: list.missingCount })}`}
              {total > 0 &&
                ` · ${t("progress", { finished: list.finishedCount, total })}`}
            </p>
          </div>

          {total === 0 ? (
            <p className="py-16 text-center text-muted-foreground">
              {t("listEmpty")}
            </p>
          ) : (
            <ol className="divide-y divide-border/50">
              {list.entries.map((entry, i) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 py-3 sm:gap-4"
                >
                  <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground sm:w-8">
                    {i + 1}
                  </span>
                  {entry.missing ? (
                    <div className="aspect-[2/3] w-12 shrink-0 rounded-md border border-dashed border-border" />
                  ) : (
                    <Link
                      href={itemHref(entry)}
                      className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-md bg-muted"
                    >
                      {entry.coverUrl ? (
                        <Image
                          src={entry.coverUrl}
                          alt={entry.title}
                          fill
                          className="object-cover"
                          sizes="48px"
                          unoptimized={entry.coverUrl.startsWith("/api/")}
                        />
                      ) : (
                        <GeneratedCover title={entry.title} />
                      )}
                    </Link>
                  )}
                  <div className="min-w-0 flex-1">
                    {entry.missing ? (
                      <p className="line-clamp-2 font-medium text-muted-foreground sm:line-clamp-1">
                        {entry.title}
                      </p>
                    ) : (
                      <Link
                        href={itemHref(entry)}
                        className="line-clamp-2 font-medium hover:underline sm:line-clamp-1"
                      >
                        {entry.title}
                      </Link>
                    )}
                    {entry.subtitle && (
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {entry.subtitle}
                      </p>
                    )}
                    {(entry.missing ||
                      entry.note ||
                      entry.readStatus !== "unread") && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {entry.missing && (
                          <span className="whitespace-nowrap rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
                            {t("notInLibrary")}
                          </span>
                        )}
                        {entry.note && (
                          <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                            {entry.note}
                          </span>
                        )}
                        {entry.readStatus !== "unread" && (
                          <span
                            className={`inline-flex items-center gap-1 text-xs ${
                              entry.readStatus === "finished"
                                ? "text-primary"
                                : "text-muted-foreground"
                            }`}
                          >
                            {entry.readStatus === "finished" && (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            {entry.readStatus === "finished"
                              ? t("finished")
                              : t("inProgress")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={busy || i === 0}
                        onClick={() =>
                          void handleMove(entry, list.entries[i - 1])
                        }
                        aria-label={t("moveUp")}
                        title={t("moveUp")}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={busy || i === total - 1}
                        onClick={() =>
                          void handleMove(entry, list.entries[i + 1])
                        }
                        aria-label={t("moveDown")}
                        title={t("moveDown")}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy}
                        onClick={() => void handleRemove(entry)}
                        aria-label={t("remove")}
                        title={t("remove")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </motion.div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("edit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reading-list-name">{t("nameLabel")}</Label>
              <Input
                id="reading-list-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reading-list-description">
                {t("descriptionLabel")}
              </Label>
              <Textarea
                id="reading-list-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={updateList.isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={updateList.isPending || !name.trim()}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("delete")}
            </DialogTitle>
            <DialogDescription>{t("deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteList.isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteList.isPending}
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
