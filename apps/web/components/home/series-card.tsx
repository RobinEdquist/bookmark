"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import type { SeriesWithBooks } from "../../lib/use-series";

interface SeriesCardProps {
  series: SeriesWithBooks;
}

export function SeriesCard({ series }: SeriesCardProps) {
  const t = useTranslations("home.recentlyUpdatedSeries");

  // Get up to 3 covers for stacking
  const covers = series.audiobooks.slice(0, 3);

  return (
    <Link href={`/series/${series.id}`}>
      <motion.article
        className="group w-40 cursor-pointer"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover="hover"
      >
        {/* Stacked covers */}
        <div className="relative aspect-square">
          {covers.map((audiobook, index) => {
            // Calculate offset for stacking effect (3rd book at back, 1st at front)
            const reverseIndex = covers.length - 1 - index;
            const offset = reverseIndex * 12;
            const scale = 1 - reverseIndex * 0.05;
            const zIndex = covers.length - reverseIndex;

            return (
              <motion.div
                key={audiobook.id}
                className="absolute overflow-hidden rounded-xl border border-black/5 shadow-md dark:border-white/5"
                style={{
                  top: offset,
                  left: offset,
                  right: -offset,
                  bottom: -offset,
                  zIndex,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
                variants={{
                  hover: {
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  },
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                {audiobook.coverUrl ? (
                  <Image
                    src={audiobook.coverUrl}
                    alt={series.name}
                    fill
                    className="object-cover"
                    sizes="160px"
                    unoptimized={audiobook.coverUrl.startsWith("/api/")}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-muted">
                    <span className="text-2xl text-muted-foreground">📚</span>
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* Single placeholder if no covers */}
          {covers.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl border bg-muted">
              <span className="text-4xl text-muted-foreground">📚</span>
            </div>
          )}
        </div>

        {/* Text content */}
        <div className="mt-3 space-y-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-tight">
            {series.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("bookCount", { count: series.bookCount })}
          </p>
        </div>
      </motion.article>
    </Link>
  );
}
