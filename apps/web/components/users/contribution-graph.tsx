"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

interface ContributionGraphProps {
  days: Record<string, number>;
  isLoading: boolean;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function getIntensity(value: number, max: number): number {
  if (value === 0 || max === 0) return 0;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

const INTENSITY_CLASSES = [
  "bg-muted",
  "bg-primary/20",
  "bg-primary/40",
  "bg-primary/60",
  "bg-primary/80",
];

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

interface WeekData {
  days: Array<{
    date: string;
    value: number;
    dayOfWeek: number;
  } | null>;
  month: number;
}

export function ContributionGraph({ days, isLoading }: ContributionGraphProps) {
  const t = useTranslations("userProfile.activity");

  const { weeks, monthLabels, maxValue } = useMemo(() => {
    // Find the most recent Sunday (start of current week)
    const today = new Date();
    const todayDay = today.getDay(); // 0=Sun, 6=Sat

    // Start 52 weeks ago, aligned to Sunday
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (52 * 7) - todayDay);
    startDate.setHours(0, 0, 0, 0);

    let max = 0;
    const values = Object.values(days);
    for (const v of values) {
      if (v > max) max = v;
    }

    const weeksArr: WeekData[] = [];
    const labels: Array<{ label: string; col: number }> = [];
    let lastMonth = -1;

    const current = new Date(startDate);
    let weekIndex = 0;

    while (current <= today) {
      const week: WeekData = { days: [], month: current.getMonth() };

      for (let d = 0; d < 7; d++) {
        if (current > today) {
          week.days.push(null);
        } else {
          const dateStr = current.toISOString().split("T")[0]!;
          const value = days[dateStr] ?? 0;
          week.days.push({
            date: dateStr,
            value,
            dayOfWeek: current.getDay(),
          });

          // Track month labels at the first day of a new month in a week
          const month = current.getMonth();
          if (month !== lastMonth) {
            labels.push({ label: MONTHS[month]!, col: weekIndex });
            lastMonth = month;
          }
        }
        current.setDate(current.getDate() + 1);
      }

      weeksArr.push(week);
      weekIndex++;
    }

    return { weeks: weeksArr, monthLabels: labels, maxValue: max };
  }, [days]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <Skeleton className="h-[140px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <div className="overflow-x-auto rounded-xl border bg-card p-4">
        <div className="min-w-fit">
          {/* Month labels */}
          <div className="flex">
            {/* Spacer for day labels */}
            <div style={{ width: 28, flexShrink: 0 }} />
            <div className="relative flex-1" style={{ height: 16 }}>
              {monthLabels.map((m, i) => (
                <span
                  key={`${m.label}-${i}`}
                  className="absolute text-xs text-muted-foreground"
                  style={{ left: m.col * 14 }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="flex gap-0">
            {/* Day labels */}
            <div
              className="flex flex-col justify-between"
              style={{ width: 28, flexShrink: 0 }}
            >
              {DAY_LABELS.map((label, i) => (
                <span
                  key={i}
                  className="text-xs text-muted-foreground leading-none"
                  style={{ height: 12 }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Weeks columns */}
            <div className="flex" style={{ gap: 2 }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: 2 }}>
                  {week.days.map((day, di) => {
                    if (!day) {
                      return (
                        <div
                          key={di}
                          style={{ width: 12, height: 12 }}
                        />
                      );
                    }

                    const intensity = getIntensity(day.value, maxValue);
                    const tooltipText =
                      day.value > 0
                        ? t("tooltip", {
                            date: day.date,
                            duration: formatDuration(day.value),
                          })
                        : `${day.date}: ${t("noListening")}`;

                    return (
                      <div
                        key={di}
                        className={`rounded-sm ${INTENSITY_CLASSES[intensity]}`}
                        style={{ width: 12, height: 12 }}
                        title={tooltipText}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <span className="text-xs text-muted-foreground">{t("less")}</span>
            {INTENSITY_CLASSES.map((cls, i) => (
              <div
                key={i}
                className={`rounded-sm ${cls}`}
                style={{ width: 12, height: 12 }}
              />
            ))}
            <span className="text-xs text-muted-foreground">{t("more")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
