"use client";

import { useTranslations } from "next-intl";
import { useRecentlyUpdatedSeries } from "../../lib/use-series";
import { HorizontalScrollRow } from "./horizontal-scroll-row";
import { SeriesGridCard } from "../series/series-grid-card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

export function RecentlyUpdatedSeriesSection() {
  const t = useTranslations("home.recentlyUpdatedSeries");
  const { data, isLoading } = useRecentlyUpdatedSeries(12);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="flex gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-40 shrink-0">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-3 w-1/2" />
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
      seeAllHref="/series"
      seeAllLabel={t("seeAll")}
    >
      {data.series.map((series) => (
        <div key={series.id} className="w-40 shrink-0">
          <SeriesGridCard series={series} />
        </div>
      ))}
    </HorizontalScrollRow>
  );
}
