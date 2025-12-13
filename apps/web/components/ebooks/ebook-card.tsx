"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { PrefetchLink } from "../ui/prefetch-link";
import { motion } from "motion/react";
import { MoreVertical, Pencil, AlertTriangle, Trash2, ImageIcon, Download, Star } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import type { EbookListItem } from "../../lib/use-ebooks";
import { useDeleteEbook } from "../../lib/use-ebooks";
import { useMyPermissions } from "../../lib/use-users";
import { toast } from "sonner";
import { EditEbookDialog } from "./edit-ebook-dialog";
import { DeleteEbookDialog } from "./delete-ebook-dialog";
import { ChangeEbookCoverDialog } from "./change-ebook-cover-dialog";

interface EbookCardProps {
  ebook: EbookListItem;
  /** Called when user wants to edit this ebook (for shared dialog) */
  onEdit?: () => void;
  /** If true, the card won't render its own edit dialog */
  externalEditDialog?: boolean;
}

export function EbookCard({ ebook, onEdit, externalEditDialog }: EbookCardProps) {
  const t = useTranslations("ebooks.card");
  const tDelete = useTranslations("ebooks.deleteDialog");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const { data: permissions } = useMyPermissions();
  const { mutateAsync: deleteEbook, isPending: isDeleting } = useDeleteEbook();

  const canEdit = permissions?.canEditMetadata ?? false;
  const canDelete = permissions?.canDeleteAudiobooks ?? false; // Use same permission for now
  const showDropdown = canEdit || canDelete;
  const isMissing = ebook.status === "missing";
  const isLinkedToHardcover = ebook.hardcoverLinked;

  const handleDelete = async () => {
    // If missing, delete immediately without confirmation
    if (isMissing) {
      try {
        await deleteEbook({ id: ebook.id, deleteFiles: false });
        toast.success(tDelete("success"));
      } catch {
        toast.error(tDelete("error"));
      }
    } else {
      // Show confirmation dialog for non-missing ebooks
      setDeleteOpen(true);
    }
  };

  const handleDownload = () => {
    // Open download endpoint in new tab
    window.open(`/api/ebooks/${ebook.id}/file`, "_blank");
  };

  const primaryAuthor = ebook.authors[0]?.name;
  const primarySeries = ebook.series[0];

  // Show series info if available, otherwise subtitle
  const secondaryText = primarySeries
    ? t("bookInSeries", { order: primarySeries.order, series: primarySeries.name })
    : ebook.subtitle;

  return (
    <>
      <motion.article
        className="group relative flex flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover="hover"
      >
        {/* Cover Image */}
        <PrefetchLink href={`/ebooks/${ebook.id}`}>
          <motion.div
            className="relative aspect-[2/3] overflow-hidden rounded-xl border border-black/5 dark:border-white/5"
            variants={{
              hover: {
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                borderColor: "rgba(0,0,0,0.1)",
              },
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            {ebook.coverUrl ? (
              <Image
                src={ebook.coverUrl}
                alt={ebook.title}
                fill
                className={`object-cover ${isMissing ? "opacity-50 grayscale" : ""}`}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                unoptimized={ebook.coverUrl.startsWith("/api/")}
              />
            ) : (
              <div className={`flex h-full items-center justify-center bg-muted ${isMissing ? "opacity-50" : ""}`}>
                <span className="text-4xl text-muted-foreground">📖</span>
              </div>
            )}
            {/* Missing status overlay */}
            {isMissing && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-destructive/20"
                title={t("missingDescription")}
              >
                <div className="rounded-full bg-destructive p-2 shadow-lg">
                  <AlertTriangle className="h-6 w-6 text-destructive-foreground" />
                </div>
              </div>
            )}
            {/* Hardcover rating badge */}
            {isLinkedToHardcover && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                {ebook.hardcoverRating !== null && (
                  <div
                    className="flex items-center gap-0.5 rounded-full bg-background/90 px-1.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm"
                    title={t("rating", {
                      rating: ebook.hardcoverRating.toFixed(1),
                      count: ebook.hardcoverRatingsCount ?? 0,
                    })}
                  >
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    <span>{ebook.hardcoverRating.toFixed(1)}</span>
                  </div>
                )}
                <div
                  className="rounded-full bg-background/90 p-1 shadow-sm backdrop-blur-sm"
                  title={t("linkedToHardcover")}
                >
                  <Image
                    src="/hardcover.svg"
                    alt="Hardcover"
                    width={14}
                    height={14}
                    className="opacity-80"
                  />
                </div>
              </div>
            )}
          </motion.div>
        </PrefetchLink>

        {/* Text Content with Menu */}
        <div className="mt-3 flex items-start gap-1">
          <PrefetchLink href={`/ebooks/${ebook.id}`} className="min-w-0 flex-1">
            <div className="space-y-1">
              <h3 className="line-clamp-2 text-sm font-medium leading-tight">
                {ebook.title}
              </h3>

              {secondaryText && (
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {secondaryText}
                </p>
              )}

              {primaryAuthor && (
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {primaryAuthor}
                </p>
              )}
            </div>
          </PrefetchLink>

          {showDropdown && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!isMissing && (
                  <DropdownMenuItem onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                    {t("download")}
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <>
                    {!isMissing && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={() => {
                      if (onEdit) {
                        onEdit();
                      } else {
                        setEditOpen(true);
                      }
                    }}>
                      <Pencil className="h-4 w-4" />
                      {t("edit")}
                    </DropdownMenuItem>
                  </>
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={() => setChangeCoverOpen(true)}>
                    <ImageIcon className="h-4 w-4" />
                    {t("changeCover")}
                  </DropdownMenuItem>
                )}
                {canDelete && <DropdownMenuSeparator />}
                {canDelete && (
                  <DropdownMenuItem
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleting ? tDelete("deleting") : t("delete")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </motion.article>

      {canEdit && !externalEditDialog && (
        <EditEbookDialog
          ebook={ebook}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {canDelete && (
        <DeleteEbookDialog
          ebookId={ebook.id}
          ebookTitle={ebook.title}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}

      {canEdit && (
        <ChangeEbookCoverDialog
          ebookId={ebook.id}
          ebookTitle={ebook.title}
          currentCoverUrl={ebook.coverUrl}
          open={changeCoverOpen}
          onOpenChange={setChangeCoverOpen}
        />
      )}
    </>
  );
}
