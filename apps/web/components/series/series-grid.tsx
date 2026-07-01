"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Library } from "lucide-react";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { SeriesGridCard } from "./series-grid-card";
import type { SeriesWithBooks } from "../../lib/use-series";

interface SeriesGridProps {
  series: SeriesWithBooks[];
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  emptyMessage?: string;
  /** Disable the entrance animation, e.g. when restoring a scroll position. */
  animateEntrance?: boolean;
}

export function SeriesGrid({
  series,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  emptyMessage,
  animateEntrance = true,
}: SeriesGridProps) {
  const t = useTranslations("series");
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!hasNextPage || !fetchNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

  // Loading skeletons
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (series.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Library className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">{t("empty.title")}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {emptyMessage || t("empty.description")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {series.map((s) => (
          <SeriesGridCard key={s.id} series={s} animateEntrance={animateEntrance} />
        ))}
      </div>

      {/* Load more sentinel */}
      {hasNextPage && (
        <div ref={loadMoreRef} className="mt-8 flex justify-center">
          {isFetchingNextPage && (
            <div className="grid w-full grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-square w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
