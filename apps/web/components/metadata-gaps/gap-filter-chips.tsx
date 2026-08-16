"use client";

import { useTranslations } from "next-intl";
import { Link2, PencilLine, FileAudio } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import type {
  GapFixMethod,
  MetadataGapCount,
} from "../../lib/use-metadata-gaps";

const GROUP_ORDER: GapFixMethod[] = ["link", "manual", "file"];

const GROUP_ICONS: Record<GapFixMethod, typeof Link2> = {
  link: Link2,
  manual: PencilLine,
  file: FileAudio,
};

interface GapFilterChipsProps {
  gaps: MetadataGapCount[];
  selected: string[];
  onToggle: (key: string) => void;
}

/**
 * The gap counts double as the filters.
 *
 * Grouping by how a gap gets closed is the point: "link an external source"
 * work is one click and often clears several fields at once, while "type it
 * in" work is per-item and slow. Mixing them into one flat list makes the
 * cheap wins impossible to spot.
 */
export function GapFilterChips({
  gaps,
  selected,
  onToggle,
}: GapFilterChipsProps) {
  const t = useTranslations("admin.metadata");

  return (
    <div className="space-y-4">
      {GROUP_ORDER.map((method) => {
        // A gap with no items left is noise, but a selected one stays put so
        // the filter you just applied does not vanish under your cursor.
        const group = gaps.filter(
          (gap) =>
            gap.fixableBy === method &&
            (gap.count > 0 || selected.includes(gap.key)),
        );
        if (group.length === 0) return null;

        const Icon = GROUP_ICONS[method];

        return (
          <div key={method}>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{t(`fixMethods.${method}`)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.map((gap) => {
                const isSelected = selected.includes(gap.key);
                return (
                  <button
                    key={gap.key}
                    type="button"
                    onClick={() => onToggle(gap.key)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <span>{t(`gaps.${gap.key}`)}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        isSelected
                          ? "bg-primary-foreground/20"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {gap.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
