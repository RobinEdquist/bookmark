"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { ComicSeriesCard } from "./comic-series-card";
import { useIntersectionObserver } from "../../lib/use-intersection-observer";
import type { ComicSeriesListItem } from "../../lib/use-comics";

interface ComicSeriesGridProps {
  series: ComicSeriesListItem[];
  isLoading?: boolean;
  error?: Error | null;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

function ComicSeriesSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
      <div className="mt-3 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("comics");

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="mb-4 text-6xl"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        📚
      </motion.div>
      <h3 className="text-lg font-medium">{t("empty.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("empty.description")}</p>
    </motion.div>
  );
}

export function ComicSeriesGrid({
  series,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: ComicSeriesGridProps) {
  const t = useTranslations("comics");

  // Intersection observer for infinite scroll
  const loadMoreRef = useIntersectionObserver(
    () => {
      if (hasNextPage && !isFetchingNextPage && onLoadMore) {
        onLoadMore();
      }
    },
    { enabled: hasNextPage && !isFetchingNextPage }
  );

  // Shared edit dialog state for navigation between series (wired in Task 6)
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const seriesIds = series.map((s) => s.id);

  const handleOpenEdit = useCallback((seriesId: string) => {
    setEditingSeriesId(seriesId);
  }, []);

  const handleNavigate = useCallback((seriesId: string) => {
    setEditingSeriesId(seriesId);
  }, []);

  // Keep navigation scaffold in scope for Task 6 dialog wiring
  void editingSeriesId;
  void seriesIds;
  void handleNavigate;

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-destructive">{t("error")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <ComicSeriesSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (series.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <motion.div
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.05,
            },
          },
        }}
      >
        {series.map((s) => (
          <ComicSeriesCard
            key={s.id}
            series={s}
            onEdit={() => handleOpenEdit(s.id)}
            externalEditDialog
          />
        ))}
      </motion.div>

      {/* Infinite scroll sentinel */}
      {hasNextPage && (
        <div
          ref={loadMoreRef}
          className="flex items-center justify-center py-8"
        >
          {isFetchingNextPage && (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

      {/* edit/delete/cover dialogs wired in Task 6 */}
    </>
  );
}
