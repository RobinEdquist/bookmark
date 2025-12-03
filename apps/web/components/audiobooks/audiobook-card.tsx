"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { MoreVertical, Pencil, Star, AlertTriangle, Trash2, ImageIcon } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import type { AudiobookListItem } from "../../lib/use-audiobooks";
import { useDeleteAudiobook } from "../../lib/use-audiobooks";
import { useMyPermissions } from "../../lib/use-users";
import { useHardcoverStatus, useHardcoverUnlinkAudiobook } from "../../lib/use-hardcover";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query-keys";
import { EditAudiobookDialog } from "./edit-audiobook-dialog";
import { HardcoverSyncDialog } from "../hardcover/hardcover-sync-dialog";
import { DeleteAudiobookDialog } from "./delete-audiobook-dialog";
import { ChangeCoverDialog } from "./change-cover-dialog";

interface AudiobookCardProps {
  audiobook: AudiobookListItem;
  /** Called when user wants to edit this audiobook (for shared dialog) */
  onEdit?: () => void;
  /** If true, the card won't render its own edit dialog */
  externalEditDialog?: boolean;
}

export function AudiobookCard({ audiobook, onEdit, externalEditDialog }: AudiobookCardProps) {
  const t = useTranslations("audiobooks.card");
  const tLink = useTranslations("audiobooks.hardcoverLink");
  const tDelete = useTranslations("audiobooks.deleteDialog");
  const [editOpen, setEditOpen] = useState(false);
  const [hardcoverSyncOpen, setHardcoverSyncOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const { data: permissions } = useMyPermissions();
  const { isConfigured: isHardcoverConfigured } = useHardcoverStatus();
  const { unlinkAudiobook, isUnlinking } = useHardcoverUnlinkAudiobook();
  const { mutateAsync: deleteAudiobook, isPending: isDeleting } = useDeleteAudiobook();
  const queryClient = useQueryClient();

  const canEdit = permissions?.canEditMetadata ?? false;
  const canDelete = permissions?.canDeleteAudiobooks ?? false;
  const showDropdown = canEdit || canDelete || isHardcoverConfigured;
  const isLinkedToHardcover = audiobook.hardcoverLinked;
  const isMissing = audiobook.status === "missing";

  const handleUnlink = async () => {
    try {
      await unlinkAudiobook(audiobook.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
      toast.success(tLink("toast.unlinked"));
    } catch {
      toast.error(tLink("toast.unlinkFailed"));
    }
  };

  const handleDelete = async () => {
    // If missing, delete immediately without confirmation
    if (isMissing) {
      try {
        await deleteAudiobook({ id: audiobook.id, deleteFiles: false });
        toast.success(tDelete("success"));
      } catch {
        toast.error(tDelete("error"));
      }
    } else {
      // Show confirmation dialog for non-missing audiobooks
      setDeleteOpen(true);
    }
  };

  const primaryAuthor = audiobook.authors[0]?.name;
  const primarySeries = audiobook.series[0];

  // Show series info if available, otherwise subtitle
  const secondaryText = primarySeries
    ? t("bookInSeries", { order: primarySeries.order, series: primarySeries.name })
    : audiobook.subtitle;

  return (
    <>
      <motion.article
        className="group relative flex flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover="hover"
      >
        {/* Cover Image */}
        <Link href={`/audiobooks/${audiobook.id}`}>
          <motion.div
            className="relative aspect-square overflow-hidden rounded-xl border border-black/5 dark:border-white/5"
            variants={{
              hover: {
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                borderColor: "rgba(0,0,0,0.1)",
              },
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            {audiobook.coverUrl ? (
              <Image
                src={audiobook.coverUrl}
                alt={audiobook.title}
                fill
                className={`object-cover ${isMissing ? "opacity-50 grayscale" : ""}`}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                unoptimized={audiobook.coverUrl.startsWith("/api/")}
              />
            ) : (
              <div className={`flex h-full items-center justify-center bg-muted ${isMissing ? "opacity-50" : ""}`}>
                <span className="text-4xl text-muted-foreground">📚</span>
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
            {isLinkedToHardcover && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                {audiobook.hardcoverRating !== null && (
                  <div
                    className="flex items-center gap-0.5 rounded-full bg-background/90 px-1.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm"
                    title={t("rating", {
                      rating: audiobook.hardcoverRating.toFixed(1),
                      count: audiobook.hardcoverRatingsCount ?? 0,
                    })}
                  >
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    <span>{audiobook.hardcoverRating.toFixed(1)}</span>
                  </div>
                )}
                <div
                  className="rounded-full bg-background/90 p-1.5 shadow-sm backdrop-blur-sm"
                  title={t("linkedToHardcover")}
                >
                  <Image
                    src="/hardcover.svg"
                    alt="Hardcover"
                    width={14}
                    height={14}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </Link>

        {/* Text Content with Menu */}
        <div className="mt-3 flex items-start gap-1">
          <Link href={`/audiobooks/${audiobook.id}`} className="min-w-0 flex-1">
            <div className="space-y-1">
              <h3 className="line-clamp-2 text-sm font-medium leading-tight">
                {audiobook.title}
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
                {canEdit && (
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
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={() => setChangeCoverOpen(true)}>
                    <ImageIcon className="h-4 w-4" />
                    {t("changeCover")}
                  </DropdownMenuItem>
                )}
                {canEdit && isHardcoverConfigured && <DropdownMenuSeparator />}
                {isHardcoverConfigured && !isLinkedToHardcover && (
                  <DropdownMenuItem onClick={() => setHardcoverSyncOpen(true)}>
                    <Image
                      src="/hardcover.svg"
                      alt="Hardcover"
                      width={16}
                      height={16}
                    />
                    {t("syncWithHardcover")}
                  </DropdownMenuItem>
                )}
                {isHardcoverConfigured && isLinkedToHardcover && (
                  <DropdownMenuItem onClick={handleUnlink} disabled={isUnlinking}>
                    <Image
                      src="/hardcover.svg"
                      alt="Hardcover"
                      width={16}
                      height={16}
                    />
                    {isUnlinking ? tLink("unlinking") : t("unlinkFromHardcover")}
                  </DropdownMenuItem>
                )}
                {canDelete && (canEdit || isHardcoverConfigured) && <DropdownMenuSeparator />}
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
        <EditAudiobookDialog
          audiobook={audiobook}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {isHardcoverConfigured && (
        <HardcoverSyncDialog
          mediaType="audiobook"
          mediaId={audiobook.id}
          mediaTitle={audiobook.title}
          open={hardcoverSyncOpen}
          onOpenChange={setHardcoverSyncOpen}
        />
      )}

      {canDelete && (
        <DeleteAudiobookDialog
          audiobookId={audiobook.id}
          audiobookTitle={audiobook.title}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}

      {canEdit && (
        <ChangeCoverDialog
          audiobookId={audiobook.id}
          audiobookTitle={audiobook.title}
          currentCoverUrl={audiobook.coverUrl}
          open={changeCoverOpen}
          onOpenChange={setChangeCoverOpen}
        />
      )}
    </>
  );
}
