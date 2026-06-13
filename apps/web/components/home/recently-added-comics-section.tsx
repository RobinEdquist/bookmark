"use client";

import { useTranslations } from "next-intl";
import { useComicSeries } from "../../lib/use-comics";
import { useLibraryAvailability } from "../../lib/use-library-availability";
import { HorizontalScrollRow } from "./horizontal-scroll-row";
import { ComicSeriesCard } from "../comics/comic-series-card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

export function RecentlyAddedComicsSection() {
  const t = useTranslations("home.recentlyAddedComics");
  const { data: availability } = useLibraryAvailability();

  const { data, isLoading } = useComicSeries({
    sortBy: "recentlyAdded",
    sortOrder: "desc",
    limit: 12,
  });

  // Don't show section if comics library is not configured
  if (!availability?.comics) {
    return null;
  }

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="flex gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-40 shrink-0">
              <Skeleton className="aspect-[2/3] rounded-xl" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!data?.series.length) {
    return null;
  }

  return (
    <HorizontalScrollRow
      title={t("title")}
      seeAllHref="/comics?sortBy=recentlyAdded&sortOrder=desc"
      seeAllLabel={t("seeAll")}
    >
      {data.series.map((series) => (
        <div key={series.id} className="w-40 shrink-0">
          <ComicSeriesCard series={series} />
        </div>
      ))}
    </HorizontalScrollRow>
  );
}
