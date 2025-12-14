"use client";

import { useTranslations } from "next-intl";
import { useLibraryStats } from "../../lib/use-library-stats";
import { useLibraryAvailability } from "../../lib/use-library-availability";
import { StatsCard } from "./stats-card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

export function StatsSection() {
  const t = useTranslations("home.stats");
  const { data, isLoading } = useLibraryStats();
  const { data: availability, isLoading: isLoadingAvailability } = useLibraryAvailability();

  if (isLoading || isLoadingAvailability) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data || !availability) {
    return null;
  }

  // Don't show section if no libraries are configured
  if (!availability.audiobooks && !availability.ebooks) {
    return null;
  }

  // Build stats array based on available libraries
  const stats: { value: number | string; label: string }[] = [];

  // Audiobook count
  if (availability.audiobooks) {
    stats.push({ value: data.audiobookCount, label: t("audiobooks") });
  }

  // Ebook count
  if (availability.ebooks) {
    stats.push({ value: data.ebookCount, label: t("ebooks") });
  }

  // Authors (shown if audiobooks available)
  if (availability.audiobooks) {
    stats.push({ value: data.authorCount, label: t("authors") });
  }

  // Determine grid columns based on number of stats
  const gridCols = stats.length === 1
    ? "grid-cols-1"
    : stats.length === 2
      ? "grid-cols-2"
      : "grid-cols-3";

  return (
    <div className={`grid gap-4 ${gridCols}`}>
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
