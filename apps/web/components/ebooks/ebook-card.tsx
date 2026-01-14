"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { MoreVertical, Pencil, AlertTriangle, Trash2, ImageIcon, Download, ListPlus } from "lucide-react";
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
import { useGrFinderStatus, useGoodreadsUnlinkMedia } from "../../lib/use-goodreads";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query-keys";
import { EditEbookDialog } from "./edit-ebook-dialog";
import { DeleteEbookDialog } from "./delete-ebook-dialog";
import { ChangeEbookCoverDialog } from "./change-ebook-cover-dialog";
import { AddToListDialog } from "../lists/add-to-list-dialog";
import { GoodreadsSearchDialog } from "../goodreads/goodreads-search-dialog";
import { formatSeriesOrder } from "../../lib/format-series";

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
  const tGoodreads = useTranslations("ebooks.goodreadsLink");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [goodreadsSyncOpen, setGoodreadsSyncOpen] = useState(false);
  const { data: permissions } = useMyPermissions();
  const { isConfigured: isGoodreadsConfigured } = useGrFinderStatus();
  const { unlinkMedia: unlinkGoodreads, isUnlinking: isUnlinkingGoodreads } = useGoodreadsUnlinkMedia();
  const { mutateAsync: deleteEbook, isPending: isDeleting } = useDeleteEbook();
  const queryClient = useQueryClient();

  const canEdit = permissions?.canEditMetadata ?? false;
  const canDelete = permissions?.canDelete ?? false;
  const showDropdown = canEdit || canDelete || isGoodreadsConfigured;
  const isMissing = ebook.status === "missing";
  const isLinkedToHardcover = ebook.hardcoverLinked;
  const isLinkedToGoodreads = ebook.goodreadsLinked;

  const handleUnlinkGoodreads = async () => {
    try {
      await unlinkGoodreads({ mediaType: "ebook", mediaId: ebook.id });
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
      toast.success(tGoodreads("toast.unlinked"));
    } catch {
      toast.error(tGoodreads("toast.unlinkFailed"));
    }
  };

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
    ? t("bookInSeries", { series: primarySeries.name, order: formatSeriesOrder(primarySeries.order) })
    : ebook.subtitle;

  return (
    <>
      <motion.article
        className="group relative flex flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Cover Image */}
        <Link href={`/ebooks/${ebook.id}`} prefetch={false}>
          <motion.div
            className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-sm"
            whileHover={{
              scale: 1.05,
              y: -4,
              boxShadow: "0 12px 24px rgba(0,0,0,0.15)",
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
          </motion.div>
        </Link>

        {/* Text Content with Menu */}
        <div className="mt-3 flex items-start gap-1">
          <Link href={`/ebooks/${ebook.id}`} prefetch={false} className="min-w-0 flex-1">
            <div className="space-y-1">
              {/* Rating and/or Hardcover/Goodreads badge */}
              {isLinkedToHardcover && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Image
                    src="/hardcover.svg"
                    alt="Hardcover"
                    width={12}
                    height={12}
                    className="opacity-70"
                  />
                  {ebook.hardcoverRating !== null && (
                    <>
                      <span>{ebook.hardcoverRating.toFixed(1)}</span>
                      <span>({ebook.hardcoverRatingsCount?.toLocaleString() ?? 0})</span>
                    </>
                  )}
                </div>
              )}
              {isLinkedToGoodreads && !isLinkedToHardcover && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Image
                    src="/goodreads.svg"
                    alt="Goodreads"
                    width={12}
                    height={12}
                    className="dark:invert opacity-70"
                  />
                  {ebook.goodreadsRating !== null && (
                    <>
                      <span>{ebook.goodreadsRating.toFixed(1)}</span>
                      <span>({ebook.goodreadsRatingsCount?.toLocaleString() ?? 0})</span>
                    </>
                  )}
                </div>
              )}

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
          </Link>

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
                <DropdownMenuItem onClick={() => setAddToListOpen(true)}>
                  <ListPlus className="h-4 w-4" />
                  {t("addToList")}
                </DropdownMenuItem>
                {isGoodreadsConfigured && <DropdownMenuSeparator />}
                {isGoodreadsConfigured && !isLinkedToGoodreads && (
                  <DropdownMenuItem onClick={() => setGoodreadsSyncOpen(true)}>
                    <Image
                      src="/goodreads.svg"
                      alt="Goodreads"
                      width={16}
                      height={16}
                      className="dark:invert"
                    />
                    {t("syncWithGoodreads")}
                  </DropdownMenuItem>
                )}
                {isGoodreadsConfigured && isLinkedToGoodreads && (
                  <DropdownMenuItem onClick={handleUnlinkGoodreads} disabled={isUnlinkingGoodreads}>
                    <Image
                      src="/goodreads.svg"
                      alt="Goodreads"
                      width={16}
                      height={16}
                      className="dark:invert"
                    />
                    {isUnlinkingGoodreads ? tGoodreads("unlinking") : t("unlinkFromGoodreads")}
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

      <AddToListDialog
        itemType="ebook"
        itemId={ebook.id}
        open={addToListOpen}
        onOpenChange={setAddToListOpen}
      />

      {isGoodreadsConfigured && (
        <GoodreadsSearchDialog
          mediaType="ebook"
          mediaId={ebook.id}
          mediaTitle={ebook.title}
          initialQuery={ebook.title}
          open={goodreadsSyncOpen}
          onOpenChange={setGoodreadsSyncOpen}
        />
      )}
    </>
  );
}
