"use client";

import { useTranslations } from "next-intl";
import { useLibraryStats } from "../../lib/use-library-stats";
import { formatDurationLong } from "../../lib/format-duration";
import { StatsCard } from "./stats-card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

export function StatsSection() {
  const t = useTranslations("home.stats");
  const { data, isLoading } = useLibraryStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const stats = [
    { value: data.audiobookCount, label: t("audiobooks") },
    { value: formatDurationLong(data.totalDuration), label: t("totalDuration") },
    { value: data.seriesCount, label: t("series") },
    { value: data.authorCount, label: t("authors") },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <StatsCard
          key={stat.label}
          value={stat.value}
          label={stat.label}
          index={index}
        />
      ))}
    </div>
  );
}
