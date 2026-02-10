"use client";

import { useTranslations } from "next-intl";
import { BookOpen, Tag } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

type ChipVariant = "genre" | "mood" | "tag" | "contentWarning";

const variantStyles: Record<ChipVariant, string> = {
  genre: "bg-primary/10 text-primary",
  mood: "bg-muted text-muted-foreground",
  tag: "bg-muted text-muted-foreground",
  contentWarning: "bg-destructive/10 text-destructive",
};

interface QuickAddChipProps {
  value: string;
  variant: ChipVariant;
  onAddAsGenre: (name: string) => void;
  onAddAsTag: (name: string) => void;
  canEdit: boolean;
  isPending: boolean;
}

export function QuickAddChip({
  value,
  variant,
  onAddAsGenre,
  onAddAsTag,
  canEdit,
  isPending,
}: QuickAddChipProps) {
  const t = useTranslations("common.quickAdd");

  if (!canEdit) {
    return (
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]}`}
      >
        {value}
      </span>
    );
  }

  return (
    <span
      className={`group/chip inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium ${variantStyles[variant]}`}
    >
      {value}
      <span className="inline-flex gap-0.5 opacity-0 transition-opacity group-hover/chip:opacity-100">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddAsGenre(value);
                }}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 disabled:opacity-50 dark:hover:bg-white/10"
              >
                <BookOpen className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{t("addAsGenre")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddAsTag(value);
                }}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 disabled:opacity-50 dark:hover:bg-white/10"
              >
                <Tag className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{t("addAsTag")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>
    </span>
  );
}
