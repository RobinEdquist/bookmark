"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { MoreVertical, Pencil, AlertTriangle, Trash2, ImageIcon, Download } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import type { ComicSeriesListItem } from "../../lib/use-comics";
import { useMyPermissions } from "../../lib/use-users";
import { DeleteComicSeriesDialog } from "./delete-comic-series-dialog";
import { ChangeComicSeriesCoverDialog } from "./change-comic-series-cover-dialog";

interface ComicSeriesCardProps {
  series: ComicSeriesListItem;
  /** Called when user wants to edit this series (for shared dialog) */
  onEdit?: () => void;
  /** If true, the card won't render its own edit dialog */
  externalEditDialog?: boolean;
}

export function ComicSeriesCard({
  series,
  onEdit,
}: ComicSeriesCardProps) {
  const t = useTranslations("comics");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const { data: permissions } = useMyPermissions();

  const canEdit = permissions?.canEditMetadata ?? false;
  const canDelete = permissions?.canDelete ?? false;
  const showDropdown = true;
  const isMissing = series.status === "missing";

  const handleDownload = () => {
    window.open(`/api/comics/series/${series.id}/download`, "_blank");
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit();
    }
  };

  // Secondary line: publisher + start year joined with " · " (omit nulls)
  const secondaryText = [series.publisher, series.startYear]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <motion.article
        className="group relative flex flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Cover Image */}
        <Link href={`/comics/${series.id}`} prefetch={false}>
          <motion.div
            className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-sm"
            whileHover={{
              scale: 1.05,
              y: -4,
              boxShadow: "0 12px 24px rgba(0,0,0,0.15)",
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            {series.coverUrl ? (
              <Image
                src={series.coverUrl}
                alt={series.title}
                fill
                className={`object-cover ${isMissing ? "opacity-50 grayscale" : ""}`}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                unoptimized={series.coverUrl.startsWith("/api/")}
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
                title={t("card.missing")}
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
          <Link href={`/comics/${series.id}`} prefetch={false} className="min-w-0 flex-1">
            <div className="space-y-1">
              {/* Book count badge */}
              <div className="text-xs text-muted-foreground">
                {t("card.books", { count: series.bookCount })}
              </div>

              <h3 className="line-clamp-2 text-sm font-medium leading-tight">
                {series.title}
              </h3>

              {secondaryText && (
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {secondaryText}
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
                  aria-label={t("card.menu")}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!isMissing && (
                  <DropdownMenuItem onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                    {t("card.download")}
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <>
                    {!isMissing && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={handleEdit}>
                      <Pencil className="h-4 w-4" />
                      {t("card.edit")}
                    </DropdownMenuItem>
                  </>
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={() => setChangeCoverOpen(true)}>
                    <ImageIcon className="h-4 w-4" />
                    {t("card.changeCover")}
                  </DropdownMenuItem>
                )}
                {/* add-to-list: Task 12 */}
                {canDelete && <DropdownMenuSeparator />}
                {canDelete && (
                  <DropdownMenuItem
                    onClick={() => setDeleteOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("card.delete")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </motion.article>

      {canDelete && (
        <DeleteComicSeriesDialog
          seriesId={series.id}
          seriesTitle={series.title}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}

      {canEdit && (
        <ChangeComicSeriesCoverDialog
          seriesId={series.id}
          seriesTitle={series.title}
          currentCoverUrl={series.coverUrl}
          open={changeCoverOpen}
          onOpenChange={setChangeCoverOpen}
        />
      )}
    </>
  );
}
