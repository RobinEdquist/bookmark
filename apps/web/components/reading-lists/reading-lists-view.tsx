"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { ReadingListCard } from "./reading-list-card";
import { useIntersectionObserver } from "../../lib/use-intersection-observer";
import {
  useInfiniteReadingLists,
  type ReadingListMediaType,
} from "../../lib/use-reading-lists";

interface ReadingListsViewProps {
  mediaType: ReadingListMediaType;
  search: string;
  /** Where a list's page lives, e.g. "/comics/reading-lists". */
  hrefBase: string;
  /** Disable the entrance animation, e.g. when restoring a scroll position. */
  animateEntrance?: boolean;
}

const GRID =
  "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6";

export function ReadingListsView({
  mediaType,
  search,
  hrefBase,
  animateEntrance = true,
}: ReadingListsViewProps) {
  const t = useTranslations("readingLists");
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteReadingLists({ mediaType, search: search || undefined });

  const loadMoreRef = useIntersectionObserver(
    () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    { enabled: hasNextPage && !isFetchingNextPage },
  );

  const readingLists = data?.pages.flatMap((page) => page.readingLists) ?? [];

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-destructive">{t("error")}</p>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className={GRID}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex flex-col">
            <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
            <div className="mt-3 space-y-2">
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (readingLists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-lg font-medium">{t("empty")}</h3>
      </div>
    );
  }

  return (
    <>
      <motion.div
        className={GRID}
        initial={animateEntrance ? "hidden" : false}
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.05 } },
        }}
      >
        {readingLists.map((list) => (
          <ReadingListCard
            key={list.id}
            readingList={list}
            href={`${hrefBase}/${list.id}`}
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
