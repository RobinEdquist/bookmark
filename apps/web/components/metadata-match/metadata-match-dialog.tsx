"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronLeft, Search } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  useAudibleSearch,
  useAudnexusBook,
  type AudibleSearchResult,
} from "../../lib/use-audnexus";
import { useItunesSearch, type ItunesSearchResult } from "../../lib/use-itunes";
import type { SeriesEntry } from "../shared/series-entry-editor";
import {
  mapAudibleSearchResult,
  mapAudnexusBook,
  mapItunesResult,
  type MatchedMetadata,
} from "./mapping";

type Provider = "audible" | "itunes";
type Step = "search" | "review";

// Audible regions with their iTunes store-front country equivalents
const REGION_OPTIONS = [
  { value: "us", label: "US", itunesCountry: "US" },
  { value: "uk", label: "UK", itunesCountry: "GB" },
  { value: "ca", label: "CA", itunesCountry: "CA" },
  { value: "au", label: "AU", itunesCountry: "AU" },
  { value: "de", label: "DE", itunesCountry: "DE" },
  { value: "fr", label: "FR", itunesCountry: "FR" },
  { value: "it", label: "IT", itunesCountry: "IT" },
  { value: "es", label: "ES", itunesCountry: "ES" },
  { value: "jp", label: "JP", itunesCountry: "JP" },
  { value: "in", label: "IN", itunesCountry: "IN" },
] as const;

// Display labels for ISO 639-1 language codes used by the edit forms
const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  pl: "Polish",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
};

// Order in which field rows appear in the review step
const FIELD_ORDER = [
  "title",
  "subtitle",
  "authors",
  "narrators",
  "publisher",
  "language",
  "publishedYear",
  "isbn",
  "asin",
  "description",
  "genres",
  "tags",
  "series",
] as const;

type FieldKey = (typeof FIELD_ORDER)[number];

export interface MetadataMatchCurrentValues {
  title: string;
  subtitle: string;
  description: string;
  authors: string[];
  narrators?: string[];
  publisher: string;
  language: string;
  publishedYear: string;
  isbn: string;
  asin?: string;
  genres: string[];
  tags: string[];
  series: SeriesEntry[];
}

interface MetadataMatchDialogProps {
  mediaType: "audiobook" | "ebook";
  current: MetadataMatchCurrentValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the checked fields; coverUrl is included when the cover row is checked */
  onApply: (fields: MatchedMetadata) => void;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSeries(entries: SeriesEntry[]): string {
  return entries
    .map((entry) =>
      entry.order ? `${entry.seriesName} #${entry.order}` : entry.seriesName
    )
    .join("; ");
}

function formatDuration(minutes?: number): string | null {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function MetadataMatchDialog({
  mediaType,
  current,
  open,
  onOpenChange,
  onApply,
}: MetadataMatchDialogProps) {
  const t = useTranslations("common.metadataMatch");

  const [step, setStep] = useState<Step>("search");
  const [provider, setProvider] = useState<Provider>("audible");
  const [region, setRegion] = useState("us");
  const [titleInput, setTitleInput] = useState("");
  const [authorInput, setAuthorInput] = useState("");
  const [submitted, setSubmitted] = useState<{
    title: string;
    author: string;
    provider: Provider;
    region: string;
  } | null>(null);
  const [selectedAudible, setSelectedAudible] =
    useState<AudibleSearchResult | null>(null);
  const [selectedItunes, setSelectedItunes] =
    useState<ItunesSearchResult | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Prefill search inputs from the form when the dialog opens
  useEffect(() => {
    if (open) {
      setTitleInput(current.title);
      setAuthorInput(current.authors[0] ?? "");
    }
    // Prefill only on open — `current` follows live form state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const itunesCountry =
    REGION_OPTIONS.find((r) => r.value === (submitted?.region ?? region))
      ?.itunesCountry ?? "US";

  const audibleQuery = useAudibleSearch(
    submitted?.title ?? "",
    submitted?.author || undefined,
    {
      enabled: open && submitted?.provider === "audible",
      region: submitted?.region,
    }
  );

  const itunesQuery = useItunesSearch(
    [submitted?.title, submitted?.author].filter(Boolean).join(" "),
    mediaType,
    itunesCountry,
    { enabled: open && submitted?.provider === "itunes" }
  );

  const isSearching =
    submitted?.provider === "audible"
      ? audibleQuery.isLoading
      : itunesQuery.isLoading;
  const searchError =
    submitted?.provider === "audible" ? audibleQuery.error : itunesQuery.error;

  // Full Audible metadata is fetched from Audnexus once a result is chosen
  const bookQuery = useAudnexusBook(
    selectedAudible?.asin ?? "",
    submitted?.region ?? region,
    { enabled: open && step === "review" && provider === "audible" }
  );

  const matched: MatchedMetadata | null = useMemo(() => {
    if (step !== "review") return null;
    if (provider === "itunes") {
      return selectedItunes ? mapItunesResult(selectedItunes) : null;
    }
    if (bookQuery.data) return mapAudnexusBook(bookQuery.data);
    // Audnexus doesn't index every regional ASIN — fall back to the search result
    if (bookQuery.isError && selectedAudible) {
      return mapAudibleSearchResult(selectedAudible);
    }
    return null; // detail still loading
  }, [step, provider, selectedItunes, selectedAudible, bookQuery.data, bookQuery.isError]);

  // Rows shown in the review step: fields the provider returned that differ
  // from the current form values
  const fieldRows = useMemo(() => {
    if (!matched) return [];

    const currentDisplay: Record<FieldKey, string> = {
      title: current.title,
      subtitle: current.subtitle,
      authors: current.authors.join(", "),
      narrators: (current.narrators ?? []).join(", "),
      publisher: current.publisher,
      language: LANGUAGE_LABELS[current.language] ?? current.language,
      publishedYear: current.publishedYear,
      isbn: current.isbn,
      asin: current.asin ?? "",
      description: stripHtml(current.description),
      genres: current.genres.join(", "),
      tags: current.tags.join(", "),
      series: formatSeries(current.series),
    };

    const newDisplay: Partial<Record<FieldKey, string>> = {
      title: matched.title,
      subtitle: matched.subtitle,
      authors: matched.authors?.join(", "),
      narrators: matched.narrators?.join(", "),
      publisher: matched.publisher,
      language: matched.language
        ? (LANGUAGE_LABELS[matched.language] ?? matched.language)
        : undefined,
      publishedYear: matched.publishedYear,
      isbn: matched.isbn,
      asin: matched.asin,
      description: matched.description
        ? stripHtml(matched.description)
        : undefined,
      genres: matched.genres?.join(", "),
      tags: matched.tags?.join(", "),
      series: matched.series ? formatSeries(matched.series) : undefined,
    };

    return FIELD_ORDER.filter((key) => {
      if (key === "narrators" && mediaType === "ebook") return false;
      const newValue = newDisplay[key];
      return newValue !== undefined && newValue !== currentDisplay[key];
    }).map((key) => ({
      key,
      currentValue: currentDisplay[key],
      newValue: newDisplay[key] as string,
    }));
  }, [matched, current, mediaType]);

  // Default-check every row (including the cover) whenever the match changes
  useEffect(() => {
    if (!matched) return;
    const initial: Record<string, boolean> = {};
    for (const row of fieldRows) {
      initial[row.key] = true;
    }
    if (matched.coverUrl) {
      initial.cover = true;
    }
    setChecked(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched]);

  const resetAll = () => {
    setStep("search");
    setSubmitted(null);
    setSelectedAudible(null);
    setSelectedItunes(null);
    setChecked({});
  };

  const handleClose = () => {
    resetAll();
    onOpenChange(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim()) return;
    setSelectedAudible(null);
    setSelectedItunes(null);
    setSubmitted({
      title: titleInput.trim(),
      author: authorInput.trim(),
      provider,
      region,
    });
  };

  const handleApply = () => {
    if (!matched) return;
    const fields: MatchedMetadata = {};
    for (const row of fieldRows) {
      if (!checked[row.key]) continue;
      const key = row.key;
      // Copy the raw (non-display) value for each checked field
      (fields as Record<string, unknown>)[key] = matched[key];
    }
    if (checked.cover && matched.coverUrl) {
      fields.coverUrl = matched.coverUrl;
    }
    onApply(fields);
    resetAll();
    onOpenChange(false);
  };

  const hasSelection =
    provider === "audible" ? Boolean(selectedAudible) : Boolean(selectedItunes);

  const audibleResults = audibleQuery.data?.results;
  const itunesResults = itunesQuery.data?.results;

  const anyChecked =
    fieldRows.some((row) => checked[row.key]) ||
    Boolean(checked.cover && matched?.coverUrl);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {step === "search"
              ? t("description")
              : t("reviewDescription")}
          </DialogDescription>
        </DialogHeader>

        {step === "search" ? (
          <>
            {/* Provider / region / query */}
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="match-provider">{t("provider")}</Label>
                  <Select
                    value={provider}
                    onValueChange={(value) => setProvider(value as Provider)}
                  >
                    <SelectTrigger id="match-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="audible">
                        {t("providers.audible")}
                      </SelectItem>
                      <SelectItem value="itunes">
                        {t("providers.itunes")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28 space-y-1">
                  <Label htmlFor="match-region">{t("region")}</Label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger id="match-region">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="match-title">{t("titleLabel")}</Label>
                  <Input
                    id="match-title"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder={t("titlePlaceholder")}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="match-author">{t("authorLabel")}</Label>
                  <Input
                    id="match-author"
                    value={authorInput}
                    onChange={(e) => setAuthorInput(e.target.value)}
                    placeholder={t("authorPlaceholder")}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={isSearching || !titleInput.trim()}
                  >
                    <Search className="h-4 w-4 mr-1" />
                    {t("search")}
                  </Button>
                </div>
              </div>
            </form>

            {/* Results */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-[200px]">
              {!submitted ? (
                <div className="py-8 text-center text-muted-foreground">
                  {t("searchHint")}
                </div>
              ) : isSearching ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size="lg" className="text-primary" />
                </div>
              ) : searchError ? (
                <div className="py-8 text-center text-destructive">
                  {searchError instanceof Error
                    ? searchError.message
                    : t("error")}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {submitted.provider === "audible" ? (
                    audibleResults?.length ? (
                      audibleResults.map((result) => {
                        const isSelected =
                          selectedAudible?.asin === result.asin;
                        const duration = formatDuration(
                          result.durationMinutes
                        );
                        return (
                          <button
                            key={result.asin}
                            type="button"
                            onClick={() => setSelectedAudible(result)}
                            className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50 hover:bg-muted/50"
                            }`}
                          >
                            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded bg-muted">
                              {result.coverUrl ? (
                                <Image
                                  src={result.coverUrl}
                                  alt={result.title}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-2xl">
                                  🎧
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-medium text-sm line-clamp-2">
                                  {result.title}
                                </h3>
                                {isSelected && (
                                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                                )}
                              </div>
                              {result.subtitle && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {result.subtitle}
                                </p>
                              )}
                              {result.authors.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {result.authors.join(", ")}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                {result.narrators.length > 0 && (
                                  <span className="line-clamp-1">
                                    {t("narratedBy", {
                                      narrators: result.narrators.join(", "),
                                    })}
                                  </span>
                                )}
                                {duration && <span>{duration}</span>}
                                {result.releaseDate && (
                                  <span>{result.releaseDate.slice(0, 4)}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="py-8 text-center text-muted-foreground">
                        {t("noResults")}
                      </div>
                    )
                  ) : itunesResults?.length ? (
                    itunesResults.map((result) => {
                      const isSelected = selectedItunes?.id === result.id;
                      return (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => setSelectedItunes(result)}
                          className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-muted/50"
                          }`}
                        >
                          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded bg-muted">
                            {result.coverUrl ? (
                              <Image
                                src={result.coverUrl}
                                alt={result.title}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-2xl">
                                {mediaType === "audiobook" ? "🎧" : "📖"}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-medium text-sm line-clamp-2">
                                {result.title}
                              </h3>
                              {isSelected && (
                                <Check className="h-5 w-5 text-primary flex-shrink-0" />
                              )}
                            </div>
                            {result.author && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {result.author}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              {result.genres.length > 0 && (
                                <span className="line-clamp-1">
                                  {result.genres.slice(0, 2).join(", ")}
                                </span>
                              )}
                              {result.releaseDate && (
                                <span>{result.releaseDate.slice(0, 4)}</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      {t("noResults")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={handleClose}>
                {t("cancel")}
              </Button>
              <Button
                onClick={() => setStep("review")}
                disabled={!hasSelection}
              >
                {t("next")}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Field review */}
            <div className="flex-1 overflow-y-auto min-h-[200px]">
              {!matched ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12">
                  <LoadingSpinner size="lg" className="text-primary" />
                  <p className="text-sm text-muted-foreground">
                    {t("loadingDetails")}
                  </p>
                </div>
              ) : fieldRows.length === 0 && !matched.coverUrl ? (
                <div className="py-8 text-center text-muted-foreground">
                  {t("noChanges")}
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Column headers */}
                  <div className="grid grid-cols-[auto_7rem_1fr_1fr] gap-3 px-2 pb-2 text-xs font-medium text-muted-foreground">
                    <span className="w-4" />
                    <span />
                    <span>{t("currentValue")}</span>
                    <span>{t("newValue")}</span>
                  </div>
                  {fieldRows.map((row) => (
                    <label
                      key={row.key}
                      className="grid grid-cols-[auto_7rem_1fr_1fr] gap-3 items-start rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked[row.key] ?? false}
                        onCheckedChange={(value) =>
                          setChecked((prev) => ({
                            ...prev,
                            [row.key]: value === true,
                          }))
                        }
                        className="mt-0.5"
                      />
                      <span className="text-sm font-medium">
                        {t(`fields.${row.key}`)}
                      </span>
                      <span className="text-sm text-muted-foreground line-clamp-3 break-words">
                        {row.currentValue || "—"}
                      </span>
                      <span className="text-sm line-clamp-3 break-words">
                        {row.newValue}
                      </span>
                    </label>
                  ))}
                  {matched.coverUrl && (
                    <label className="grid grid-cols-[auto_7rem_1fr_1fr] gap-3 items-start rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={checked.cover ?? false}
                        onCheckedChange={(value) =>
                          setChecked((prev) => ({
                            ...prev,
                            cover: value === true,
                          }))
                        }
                        className="mt-0.5"
                      />
                      <span className="text-sm font-medium">
                        {t("fields.cover")}
                      </span>
                      <span className="text-sm text-muted-foreground">—</span>
                      <span>
                        <span className="relative block h-24 w-24 overflow-hidden rounded bg-muted">
                          <Image
                            src={matched.coverUrl}
                            alt={t("fields.cover")}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setStep("search")}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("back")}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  {t("cancel")}
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={!matched || !anyChecked}
                >
                  {t("apply")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
