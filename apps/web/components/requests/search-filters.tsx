"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { MultiSelect } from "@repo/ui/components/ui/multi-select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import { cn } from "@repo/ui/lib/utils";
import type { SearchFilters } from "../../lib/use-requests";
import {
  MAM_LANGUAGES,
  SEARCH_IN_FIELDS,
  PER_PAGE_OPTIONS,
} from "../../lib/constants/mam-languages";

interface SearchFiltersProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}

export function SearchFiltersPanel({ filters, onChange }: SearchFiltersProps) {
  const t = useTranslations("requests.filters");
  const [isOpen, setIsOpen] = useState(false);

  const languageOptions = MAM_LANGUAGES.map((lang) => ({
    value: String(lang.id),
    label: lang.name,
  }));

  const handleContentTypeChange = (value: string) => {
    onChange({
      ...filters,
      contentType: value as SearchFilters["contentType"],
    });
  };

  const handleSearchInChange = (field: string, checked: boolean) => {
    const current = filters.searchIn ?? ["title", "author"];
    const newSearchIn = checked
      ? [...current, field]
      : current.filter((f) => f !== field);
    onChange({
      ...filters,
      searchIn: newSearchIn.length > 0 ? newSearchIn : ["title"],
    });
  };

  const handleLanguagesChange = (selected: string[]) => {
    onChange({
      ...filters,
      languages: selected.map(Number),
    });
  };

  const handlePerPageChange = (value: string) => {
    onChange({
      ...filters,
      perPage: Number(value),
    });
  };

  const searchInFields = filters.searchIn ?? ["title", "author"];
  const selectedLanguages = (filters.languages ?? []).map(String);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-0 hover:bg-transparent">
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-180"
            )}
          />
          <span className="text-sm font-medium">{t("title")}</span>
          {(filters.contentType !== "all" ||
            filters.languages?.length ||
            filters.perPage !== 25) && (
            <span className="text-xs text-muted-foreground">({t("active")})</span>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <div className="rounded-lg border bg-muted/30 p-6 space-y-8">
          {/* Content Type */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("contentType.label")}</Label>
            <RadioGroup
              value={filters.contentType ?? "all"}
              onValueChange={handleContentTypeChange}
              className="flex flex-wrap gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="content-all" />
                <Label htmlFor="content-all" className="font-normal cursor-pointer">
                  {t("contentType.all")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="audiobooks" id="content-audiobooks" />
                <Label htmlFor="content-audiobooks" className="font-normal cursor-pointer">
                  {t("contentType.audiobooks")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ebooks" id="content-ebooks" />
                <Label htmlFor="content-ebooks" className="font-normal cursor-pointer">
                  {t("contentType.ebooks")}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Search In */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("searchIn.label")}</Label>
            <div className="flex flex-wrap gap-6">
              {SEARCH_IN_FIELDS.map((field) => (
                <div key={field.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`search-in-${field.id}`}
                    checked={searchInFields.includes(field.id)}
                    onCheckedChange={(checked) =>
                      handleSearchInChange(field.id, checked === true)
                    }
                  />
                  <Label
                    htmlFor={`search-in-${field.id}`}
                    className="font-normal cursor-pointer"
                  >
                    {t(`searchIn.${field.labelKey}`)}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Languages */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("languages.label")}</Label>
            <MultiSelect
              options={languageOptions}
              selected={selectedLanguages}
              onChange={handleLanguagesChange}
              placeholder={t("languages.placeholder")}
              searchPlaceholder={t("languages.searchPlaceholder")}
              emptyText={t("languages.empty")}
              className="max-w-md"
            />
          </div>

          {/* Results per page */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("perPage.label")}</Label>
            <RadioGroup
              value={String(filters.perPage ?? 25)}
              onValueChange={handlePerPageChange}
              className="flex flex-wrap gap-6"
            >
              {PER_PAGE_OPTIONS.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem value={String(option)} id={`perpage-${option}`} />
                  <Label htmlFor={`perpage-${option}`} className="font-normal cursor-pointer">
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
