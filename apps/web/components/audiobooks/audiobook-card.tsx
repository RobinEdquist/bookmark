"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { MoreVertical, Pencil } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import type { AudiobookListItem } from "../../lib/use-audiobooks";
import { useMyPermissions } from "../../lib/use-users";
import { EditAudiobookDialog } from "./edit-audiobook-dialog";

interface AudiobookCardProps {
  audiobook: AudiobookListItem;
}

export function AudiobookCard({ audiobook }: AudiobookCardProps) {
  const t = useTranslations("audiobooks.card");
  const [editOpen, setEditOpen] = useState(false);
  const { data: permissions } = useMyPermissions();

  const canEdit = permissions?.canEditMetadata ?? false;

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
                className="object-cover"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                unoptimized={audiobook.coverUrl.startsWith("/api/")}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted">
                <span className="text-4xl text-muted-foreground">📚</span>
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
                  {t("by", { author: primaryAuthor })}
                </p>
              )}
            </div>
          </Link>

          {canEdit && (
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
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  {t("edit")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </motion.article>

      {canEdit && (
        <EditAudiobookDialog
          audiobook={audiobook}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </>
  );
}
