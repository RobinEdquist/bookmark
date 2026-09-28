"use client";

import { use, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
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
import { DetailHeaderActions } from "../../../../../components/layout/detail-header-actions";
import { AddEbookToGroupDialog } from "../../../../../components/ebooks/add-ebook-to-group-dialog";
import { ChangeEbookGroupCoverDialog } from "../../../../../components/ebooks/change-ebook-group-cover-dialog";
import { EbookGroupMembers } from "../../../../../components/ebooks/ebook-group-members";
import { EditEbookGroupDialog } from "../../../../../components/ebooks/edit-ebook-group-dialog";
import { GeneratedCover } from "../../../../../components/common/generated-cover";
import { useLibraryReturnUrl } from "../../../../../lib/use-library-return-url";
import { useMyPermissions } from "../../../../../lib/use-users";
import {
  useClearEbookGroupCover,
  useDeleteEbookGroup,
  useEbookGroup,
} from "../../../../../lib/use-ebook-groups";

export default function EbookGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("ebooks");
  const router = useRouter();
  const savedReturn = useLibraryReturnUrl("/ebooks");
  const backHref = savedReturn.includes("view=groups")
    ? savedReturn
    : "/ebooks?view=groups";

  const { data: group, isLoading, error } = useEbookGroup(id);
  const { data: permissions } = useMyPermissions();
  const canEdit = permissions?.canEditMetadata ?? false;
  const canDelete = permissions?.canDelete ?? false;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);

  const deleteGroup = useDeleteEbookGroup();
  const clearCover = useClearEbookGroupCover();

  const handleDelete = async () => {
    try {
      await deleteGroup.mutateAsync(id);
      toast.success(t("groups.deleteSuccess"));
      router.push("/ebooks?view=groups");
    } catch {
      toast.error(t("groups.error"));
    }
  };

  const handleClearCover = async () => {
    try {
      await clearCover.mutateAsync(id);
      toast.success(t("groups.coverRemoved"));
    } catch {
      toast.error(t("groups.error"));
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </main>
    );
  }

  if (error || !group) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{t("groups.error")}</p>
        <Button variant="outline" asChild>
          <Link href={backHref} scroll={false}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("groups.back")}
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={backHref} scroll={false} aria-label={t("groups.back")}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1" />
          <DetailHeaderActions
            actions={[
              ...(canEdit
                ? [
                    {
                      key: "add",
                      label: t("groups.addEbook"),
                      icon: <Plus className="h-5 w-5" />,
                      onClick: () => setAddOpen(true),
                    },
                    {
                      key: "cover",
                      label: t("groups.changeCover"),
                      icon: <ImageIcon className="h-5 w-5" />,
                      onClick: () => setCoverOpen(true),
                    },
                    ...(group.hasOwnCover
                      ? [
                          {
                            key: "remove-cover",
                            label: t("groups.removeCover"),
                            icon: <ImageIcon className="h-5 w-5" />,
                            onClick: () => void handleClearCover(),
                          },
                        ]
                      : []),
                    {
                      key: "edit",
                      label: t("groups.edit"),
                      icon: <Pencil className="h-5 w-5" />,
                      onClick: () => setEditOpen(true),
                    },
                  ]
                : []),
              ...(canDelete
                ? [
                    {
                      key: "delete",
                      label: t("groups.delete"),
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

      <div className="mx-auto max-w-3xl px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-8 flex gap-5">
            <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-xl bg-muted shadow-sm">
              {group.coverUrl ? (
                <Image
                  src={group.coverUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="96px"
                  unoptimized={group.coverUrl.startsWith("/api/")}
                />
              ) : (
                <GeneratedCover title={group.name} />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight">
                {group.name}
              </h1>
              {group.description && (
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                  {group.description}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {t("groups.ebookCount", { count: group.ebooks.length })}
              </p>
            </div>
          </div>

          <EbookGroupMembers
            groupId={group.id}
            ebooks={group.ebooks}
            canEdit={canEdit}
          />
        </motion.div>
      </div>

      {canEdit && (
        <>
          <EditEbookGroupDialog
            group={group}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <AddEbookToGroupDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            groupId={group.id}
            memberIds={group.ebooks.map((ebook) => ebook.id)}
          />
          <ChangeEbookGroupCoverDialog
            groupId={group.id}
            groupName={group.name}
            currentCoverUrl={group.hasOwnCover ? group.coverUrl : null}
            open={coverOpen}
            onOpenChange={setCoverOpen}
          />
        </>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("groups.delete")}</DialogTitle>
            <DialogDescription>{t("groups.deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteGroup.isPending}
            >
              {t("groups.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteGroup.isPending}
            >
              {t("groups.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
