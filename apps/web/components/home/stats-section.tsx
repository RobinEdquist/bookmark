"use client";

import { useTranslations } from "next-intl";
import { useLibraryStats } from "../../lib/use-library-stats";
import { useLibraryAvailability } from "../../lib/use-library-availability";
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
  const { data: availability, isLoading: isLoadingAvailability } = useLibraryAvailability();

  if (isLoading || isLoadingAvailability) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {[...Array(6)].map((_, i) => (
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

  // Audiobook-related stats (audiobooks, duration, series, authors)
  if (availability.audiobooks) {
    stats.push({ value: data.audiobookCount, label: t("audiobooks") });
    stats.push({ value: formatDurationHours(data.totalDuration), label: t("totalDuration") });
  }

  // Ebook-related stats
  if (availability.ebooks) {
    stats.push({ value: data.ebookCount, label: t("ebooks") });
    stats.push({ value: formatNumber(data.totalPages), label: t("totalPages") });
  }

  // Series and authors are shared (shown if audiobooks available)
  if (availability.audiobooks) {
    stats.push({ value: data.seriesCount, label: t("series") });
    stats.push({ value: data.authorCount, label: t("authors") });
  }

  // Determine grid columns based on number of stats
  const gridCols = stats.length <= 2
    ? "grid-cols-2"
    : stats.length <= 4
      ? "grid-cols-2 md:grid-cols-4"
      : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6";

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
