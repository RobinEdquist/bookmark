"use client";

import { useTranslations } from "next-intl";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Button } from "@repo/ui/components/ui/button";
import { type SortField, type SortOrder } from "../../lib/use-sort-preference";

interface SortSelectProps {
  sortBy: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
  options?: SortField[];
}

const DEFAULT_SORT_OPTIONS: SortField[] = ["title", "createdAt", "author", "rating", "series"];
export const COMICS_SORT_OPTIONS: SortField[] = ["title", "recentlyAdded", "startYear"];

export function SortSelect({ sortBy, sortOrder, onSortChange, options = DEFAULT_SORT_OPTIONS }: SortSelectProps) {
  const t = useTranslations("common.sort");

  const getLabel = (field: SortField): string => {
    switch (field) {
      case "title":
        return t("title");
      case "createdAt":
        return t("dateAdded");
      case "author":
        return t("author");
      case "rating":
        return t("rating");
      case "series":
        return t("series");
      case "recentlyAdded":
        return t("recentlyAdded");
      case "startYear":
        return t("startYear");
    }
  };

  const getDirectionLabel = (field: SortField, order: SortOrder): string => {
    if (field === "createdAt" || field === "recentlyAdded") {
      return order === "desc" ? t("newest") : t("oldest");
    }
    if (field === "rating") {
      return order === "desc" ? t("highest") : t("lowest");
    }
    return order === "asc" ? t("asc") : t("desc");
  };

  const DirectionIcon = sortOrder === "asc" ? ArrowUp : ArrowDown;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ArrowUpDown className="h-4 w-4" />
          <span className="hidden sm:inline">{t("label")}:</span>
          <span>{getLabel(sortBy)}</span>
          <DirectionIcon className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((field) => {
          const isActive = sortBy === field;
          return (
            <DropdownMenuItem
              key={field}
              onClick={() => onSortChange(field)}
              className={isActive ? "bg-accent" : ""}
            >
              <span className="flex-1">{getLabel(field)}</span>
              {isActive && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {getDirectionLabel(field, sortOrder)}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
