"use client";

import { useTranslations } from "next-intl";
import { useLibraryStats } from "../../lib/use-library-stats";
import { formatDurationHours } from "../../lib/format-duration";
import { StatsCard } from "./stats-card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

export function StatsSection() {
  const t = useTranslations("home.stats");
  const { data, isLoading } = useLibraryStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {[...Array(6)].map((_, i) => (
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
    { value: formatDurationHours(data.totalDuration), label: t("totalDuration") },
    { value: data.ebookCount, label: t("ebooks") },
    { value: formatNumber(data.totalPages), label: t("totalPages") },
    { value: data.seriesCount, label: t("series") },
    { value: data.authorCount, label: t("authors") },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
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
