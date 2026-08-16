"use client";

import { useTranslations } from "next-intl";
import { AudioLines, BookMarked, Link2, Sparkles } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import {
  GAP_CATEGORY_ORDER,
  type GapCategory,
  type MetadataGapCount,
} from "../../lib/use-metadata-gaps";

const CATEGORY_ICONS: Record<GapCategory, typeof Link2> = {
  essentials: Sparkles,
  audio: AudioLines,
  publication: BookMarked,
  matches: Link2,
};

interface GapFilterChipsProps {
  gaps: MetadataGapCount[];
  selected: string[];
  onToggle: (key: string) => void;
}

/**
 * The gap counts double as the filters, grouped by what kind of data each one
 * is — essentials, audio, publication detail, external matches.
 *
 * An earlier version grouped by how a gap gets fixed, which quietly lied:
 * fields were filed as "has to be filled in by hand" when the Audible and
 * iTunes match dialogs fill them. What a field *is* stays true regardless of
 * which integrations happen to be configured.
 */
export function GapFilterChips({
  gaps,
  selected,
  onToggle,
}: GapFilterChipsProps) {
  const t = useTranslations("admin.metadata");

  return (
    <div className="space-y-4">
      {GAP_CATEGORY_ORDER.map((category) => {
        // A gap with no items left is noise, but a selected one stays put so
        // the filter you just applied does not vanish under your cursor.
        const group = gaps.filter(
          (gap) =>
            gap.category === category &&
            (gap.count > 0 || selected.includes(gap.key)),
        );
        if (group.length === 0) return null;

        const Icon = CATEGORY_ICONS[category];

        return (
          <div key={category}>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{t(`categories.${category}`)}</span>
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
