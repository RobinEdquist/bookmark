"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import type { AudiobookListItem } from "../../lib/use-audiobooks";

interface AudiobookCardProps {
  audiobook: AudiobookListItem;
}

export function AudiobookCard({ audiobook }: AudiobookCardProps) {
  const t = useTranslations("audiobooks.card");

  const primaryAuthor = audiobook.authors[0]?.name;
  const primarySeries = audiobook.series[0];

  // Show series info if available, otherwise subtitle
  const secondaryText = primarySeries
    ? t("bookInSeries", { order: primarySeries.order, series: primarySeries.name })
    : audiobook.subtitle;

  return (
    <Link href={`/audiobooks/${audiobook.id}`}>
      <motion.article
        className="group relative flex flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover="hover"
      >
        {/* Cover Image */}
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
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted">
              <span className="text-4xl text-muted-foreground">📚</span>
            </div>
          )}
        </motion.div>

        {/* Text Content */}
        <div className="mt-3 space-y-1">
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
      </motion.article>
    </Link>
  );
}
