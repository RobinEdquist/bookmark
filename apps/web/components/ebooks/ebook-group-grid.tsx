"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { EbookGroupCard } from "./ebook-group-card";
import { useIntersectionObserver } from "../../lib/use-intersection-observer";
import type { EbookGroupListItem } from "../../lib/use-ebook-groups";

interface EbookGroupGridProps {
  groups: EbookGroupListItem[];
  isLoading?: boolean;
  error?: Error | null;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  animateEntrance?: boolean;
}

function EbookGroupSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("ebooks");

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h3 className="text-lg font-medium">{t("groups.empty")}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {t("groups.emptyDescription")}
      </p>
    </motion.div>
  );
}

export function EbookGroupGrid({
  groups,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  animateEntrance = true,
}: EbookGroupGridProps) {
  const t = useTranslations("ebooks");
  const loadMoreRef = useIntersectionObserver(
    () => {
      if (hasNextPage && !isFetchingNextPage && onLoadMore) onLoadMore();
    },
    { enabled: hasNextPage && !isFetchingNextPage },
  );

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-destructive">{t("groups.error")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <EbookGroupSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (groups.length === 0) return <EmptyState />;

  return (
    <>
      <motion.div
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        initial={animateEntrance ? "hidden" : false}
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.05 } },
        }}
      >
        {groups.map((group) => (
          <EbookGroupCard
            key={group.id}
            group={group}
            animateEntrance={animateEntrance}
          />
        ))}
      </motion.div>
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
    </>
  );
}
