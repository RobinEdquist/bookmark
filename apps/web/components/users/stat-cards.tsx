"use client";

import { useTranslations } from "next-intl";
import { Clock, BookCheck, BookOpen, Flame } from "lucide-react";

import type { UserStatsResponse } from "../../lib/use-user-profile";

interface StatCardsProps {
  stats: UserStatsResponse;
}

function formatListeningTime(
  seconds: number,
  t: ReturnType<typeof useTranslations<"userProfile.stats">>,
): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return t("hours", { hours, minutes });
}

export function StatCards({ stats }: StatCardsProps) {
  const t = useTranslations("userProfile.stats");

  const booksCompleted =
    stats.audiobooksCompleted + stats.ebooksCompleted;
  const booksInProgress =
    stats.audiobooksInProgress + stats.ebooksInProgress;

  const cards = [
    {
      icon: Clock,
      label: t("totalListeningTime"),
      value: formatListeningTime(stats.totalListeningTime, t),
    },
    {
      icon: BookCheck,
      label: t("booksCompleted"),
      value: booksCompleted,
    },
    {
      icon: BookOpen,
      label: t("booksInProgress"),
      value: booksInProgress,
    },
    {
      icon: Flame,
      label: t("longestStreak"),
      value: t("days", { count: stats.longestStreak }),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border bg-card p-4"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <card.icon className="h-4 w-4" />
            <span className="text-xs">{card.label}</span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight">
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
