"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

interface RemovableChipProps {
  value: string;
  variant: "genre" | "tag";
  onRemove: (name: string) => void;
  canEdit: boolean;
  isPending: boolean;
}

const variantStyles = {
  genre: "bg-primary/10 text-primary",
  tag: "bg-muted text-muted-foreground",
};

export function RemovableChip({
  value,
  variant,
  onRemove,
  canEdit,
  isPending,
}: RemovableChipProps) {
  const t = useTranslations("common.quickAdd");

  if (!canEdit) {
    return (
      <span
        className={`rounded-full px-3 py-1 text-xs font-medium ${variantStyles[variant]}`}
      >
        {value}
      </span>
    );
  }

  return (
    <span
      className={`group/chip inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-xs font-medium ${variantStyles[variant]}`}
    >
      {value}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(value);
              }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-black/10 disabled:opacity-50 group-hover/chip:opacity-100 dark:hover:bg-white/10"
            >
              <X className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{t("remove")}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}
