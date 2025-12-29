"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import type { SeriesSortBy, SeriesSortOrder } from "../../lib/use-series";

interface SeriesSortSelectProps {
  sortBy: SeriesSortBy;
  sortOrder: SeriesSortOrder;
  onSortChange: (sortBy: SeriesSortBy, sortOrder: SeriesSortOrder) => void;
}

type SortOption = `${SeriesSortBy}-${SeriesSortOrder}`;

const SORT_OPTIONS: SortOption[] = [
  "name-asc",
  "name-desc",
  "lastUpdated-desc",
  "lastUpdated-asc",
  "bookCount-desc",
  "bookCount-asc",
];

export function SeriesSortSelect({
  sortBy,
  sortOrder,
  onSortChange,
}: SeriesSortSelectProps) {
  const t = useTranslations("series");

  const currentValue: SortOption = `${sortBy}-${sortOrder}`;

  const handleChange = (value: string) => {
    const [newSortBy, newSortOrder] = value.split("-") as [SeriesSortBy, SeriesSortOrder];
    onSortChange(newSortBy, newSortOrder);
  };

  const getLabel = (option: SortOption) => {
    switch (option) {
      case "name-asc":
        return t("sort.nameAsc");
      case "name-desc":
        return t("sort.nameDesc");
      case "lastUpdated-desc":
        return t("sort.lastUpdatedDesc");
      case "lastUpdated-asc":
        return t("sort.lastUpdatedAsc");
      case "bookCount-desc":
        return t("sort.bookCountDesc");
      case "bookCount-asc":
        return t("sort.bookCountAsc");
      default:
        return option;
    }
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={t("sort.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>
            {getLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
