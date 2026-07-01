"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Library } from "lucide-react";
import { motion } from "motion/react";
import type { SeriesWithBooks } from "../../lib/use-series";

interface SeriesGridCardProps {
  series: SeriesWithBooks;
  /** Disable the entrance animation, e.g. when restoring a scroll position. */
  animateEntrance?: boolean;
}

export function SeriesGridCard({
  series,
  animateEntrance = true,
}: SeriesGridCardProps) {
  const t = useTranslations("series");

  // Get up to 3 covers for stacking (prioritize audiobooks, fall back to ebooks)
  const audiobookCovers = series.audiobooks?.map((ab) => ab.coverUrl).filter(Boolean) ?? [];
  const ebookCovers = series.ebooks?.map((eb) => eb.coverUrl).filter(Boolean) ?? [];
  const covers = [...audiobookCovers, ...ebookCovers].slice(0, 3) as string[];

  return (
    <motion.div
      initial={animateEntrance ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Link href={`/series/${series.id}`} className="group/card block">
        <motion.article className="cursor-pointer" whileHover="hover">
          {/* Stacked covers - fan layout */}
          <motion.div
            className="relative aspect-square w-full"
            initial="idle"
            whileHover="hover"
          >
            {covers.length > 0 ? (
              <div className="relative h-full w-full">
                {/* Render in reverse so first cover renders last (on top) */}
                {[...covers].reverse().map((coverUrl, reverseIndex) => {
                  const index = covers.length - 1 - reverseIndex;
                  const totalCovers = covers.length;

                  // Balanced fan configs for 1, 2, or 3 covers
                  // Front cover (index 0) is always on top and centered
                  const configs: Record<
                    number,
                    {
                      idle: { rotations: number[]; xOffsets: number[] };
                      hover: { rotations: number[]; xOffsets: number[] };
                    }
                  > = {
                    1: {
                      idle: { rotations: [0], xOffsets: [0] },
                      hover: { rotations: [0], xOffsets: [0] },
                    },
                    2: {
                      // Front centered, back fans right
                      idle: { rotations: [0, 8], xOffsets: [0, 18] },
                      hover: { rotations: [-4, 12], xOffsets: [-8, 24] },
                    },
                    3: {
                      // Front centered, others fan left and right symmetrically
                      idle: { rotations: [0, -8, 8], xOffsets: [0, -14, 14] },
                      hover: { rotations: [0, -14, 14], xOffsets: [0, -22, 22] },
                    },
                  };

                  const config = configs[totalCovers as 1 | 2 | 3] ?? configs[1];

                  return (
                    <motion.div
                      key={coverUrl + index}
                      className="absolute overflow-hidden rounded-lg border border-black/10 shadow-lg dark:border-white/10"
                      style={{
                        width: "70%",
                        height: "70%",
                        left: "15%",
                        top: "15%",
                        zIndex: totalCovers - index,
                        transformOrigin: "bottom center",
                      }}
                      variants={{
                        idle: {
                          x: `${config?.idle.xOffsets[index] ?? 0}%`,
                          rotate: config?.idle.rotations[index] ?? 0,
                          scale: 1,
                        },
                        hover: {
                          x: `${config?.hover.xOffsets[index] ?? 0}%`,
                          rotate: config?.hover.rotations[index] ?? 0,
                          scale: index === 0 ? 1.02 : 1,
                        },
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                      <Image
                        src={coverUrl}
                        alt={series.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
                        unoptimized={coverUrl.startsWith("/api/")}
                      />
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/30">
                <Library className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </motion.div>

          {/* Text content */}
          <div className="mt-3">
            <h3 className="line-clamp-2 text-sm font-medium leading-tight group-hover/card:text-primary">
              {series.name}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {t("bookCount", { count: series.bookCount })}
              </span>
            </div>
          </div>
        </motion.article>
      </Link>
    </motion.div>
  );
}
