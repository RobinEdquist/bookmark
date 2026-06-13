"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { CreatableCombobox } from "@repo/ui/components/ui/creatable-combobox";
import { CreatableSelect } from "@repo/ui/components/ui/creatable-select";
import { RichTextEditor } from "@repo/ui/components/ui/rich-text-editor";

// Common comic languages (ISO 639-1 codes)
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "no", label: "Norwegian" },
  { value: "da", label: "Danish" },
  { value: "fi", label: "Finnish" },
  { value: "pl", label: "Polish" },
  { value: "ru", label: "Russian" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
  { value: "ko", label: "Korean" },
] as const;

import {
  useComicSeriesDetail,
  useUpdateComicSeries,
  useComicPublishers,
  useComicGenres,
  type ComicSeriesListItem,
  type ComicSeriesDetail,
} from "../../lib/use-comics";
import { useTags } from "../../lib/use-tags";

// Helper to compare arrays by value
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

// Interface for tracking initial form state
interface InitialFormState {
  title: string;
  sortTitle: string;
  description: string;
  publisher: string;
  imprint: string;
  startYear: string;
  totalIssueCount: string;
  language: string;
  ageRating: string;
  genres: string[];
  tags: string[];
}

interface EditComicSeriesDialogProps {
  series: ComicSeriesListItem | ComicSeriesDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** List of series IDs for next/previous navigation */
  seriesIds?: string[];
  /** Callback when navigating to a different series */
  onNavigate?: (seriesId: string) => void;
}

export function EditComicSeriesDialog({
  series,
  open,
  onOpenChange,
  seriesIds,
  onNavigate,
}: EditComicSeriesDialogProps) {
  const t = useTranslations("comics.edit");
  const updateSeries = useUpdateComicSeries();
  const { data: existingPublishers = [] } = useComicPublishers();
  const { data: existingGenres = [] } = useComicGenres();
  const { data: existingTags = [] } = useTags();

  // For list items, fetch full details only when dialog is open
  const isListItem = series && !("description" in series);
  const { data: fullSeries } = useComicSeriesDetail(
    isListItem && series && open ? series.id : ""
  );

  const seriesData = isListItem ? fullSeries : (series as ComicSeriesDetail);

  // Form state
  const [title, setTitle] = useState("");
  const [sortTitle, setSortTitle] = useState("");
  const [description, setDescription] = useState("");
  const [publisher, setPublisher] = useState("");
  const [imprint, setImprint] = useState("");
  const [startYear, setStartYear] = useState("");
  const [totalIssueCount, setTotalIssueCount] = useState("");
  const [language, setLanguage] = useState("");
  const [ageRating, setAgeRating] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // Track initial values to detect which fields actually changed
  const [initialState, setInitialState] = useState<InitialFormState | null>(null);

  // Convert existing data to combobox options
  const genreOptions = existingGenres.map((g) => ({
    key: g.id,
    value: g.name,
    label: g.name,
  }));

  const tagOptions = existingTags.map((t) => ({
    key: t.value, // t.value is the tag ID
    value: t.label,
    label: t.label,
  }));

  // Navigation logic
  const currentIndex = series && seriesIds
    ? seriesIds.indexOf(series.id)
    : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < (seriesIds?.length ?? 0) - 1;

  const handlePrevious = useCallback(() => {
    if (hasPrevious && seriesIds && onNavigate) {
      const prevId = seriesIds[currentIndex - 1];
      if (prevId) onNavigate(prevId);
    }
  }, [hasPrevious, seriesIds, currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext && seriesIds && onNavigate) {
      const nextId = seriesIds[currentIndex + 1];
      if (nextId) onNavigate(nextId);
    }
  }, [hasNext, seriesIds, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not focused on an input element
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isInputFocused) return;

      if (e.key === "ArrowLeft" && hasPrevious) {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, hasPrevious, hasNext, handlePrevious, handleNext]);

  // Reset form when series changes
  useEffect(() => {
    if (seriesData) {
      const titleVal = seriesData.title || "";
      const sortTitleVal = seriesData.sortTitle || "";
      const descriptionVal = seriesData.description || "";
      const publisherVal = seriesData.publisher || "";
      const imprintVal = seriesData.imprint || "";
      const startYearVal = seriesData.startYear != null ? String(seriesData.startYear) : "";
      const totalIssueCountVal = seriesData.totalIssueCount != null ? String(seriesData.totalIssueCount) : "";
      const languageVal = seriesData.language || "";
      const ageRatingVal = seriesData.ageRating || "";
      const genresVal = seriesData.genres.map((g) => g.name);
      const tagsVal = seriesData.tags.map((t) => t.name);

      // Set form values
      setTitle(titleVal);
      setSortTitle(sortTitleVal);
      setDescription(descriptionVal);
      setPublisher(publisherVal);
      setImprint(imprintVal);
      setStartYear(startYearVal);
      setTotalIssueCount(totalIssueCountVal);
      setLanguage(languageVal);
      setAgeRating(ageRatingVal);
      setGenres(genresVal);
      setTags(tagsVal);

      // Store initial state for change detection
      setInitialState({
        title: titleVal,
        sortTitle: sortTitleVal,
        description: descriptionVal,
        publisher: publisherVal,
        imprint: imprintVal,
        startYear: startYearVal,
        totalIssueCount: totalIssueCountVal,
        language: languageVal,
        ageRating: ageRatingVal,
        genres: genresVal,
        tags: tagsVal,
      });
    }
  }, [seriesData]);

  const handleSave = async (closeAfterSave: boolean) => {
    if (!seriesData || !initialState) return;

    // Build update data with only fields that actually changed
    const data: Record<string, unknown> = {};

    const trimmedTitle = title.trim();
    if (trimmedTitle && trimmedTitle !== initialState.title) {
      data.title = trimmedTitle;
    }

    const trimmedSortTitle = sortTitle.trim();
    if (trimmedSortTitle !== initialState.sortTitle) {
      data.sortTitle = trimmedSortTitle || null;
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription !== initialState.description) {
      data.description = trimmedDescription || null;
    }

    const trimmedPublisher = publisher.trim();
    if (trimmedPublisher !== initialState.publisher) {
      data.publisher = trimmedPublisher || null;
    }

    const trimmedImprint = imprint.trim();
    if (trimmedImprint !== initialState.imprint) {
      data.imprint = trimmedImprint || null;
    }

    if (startYear !== initialState.startYear) {
      const parsed = startYear ? parseInt(startYear, 10) : NaN;
      data.startYear = !isNaN(parsed) ? parsed : null;
    }

    if (totalIssueCount !== initialState.totalIssueCount) {
      const parsed = totalIssueCount ? parseInt(totalIssueCount, 10) : NaN;
      data.totalIssueCount = !isNaN(parsed) ? parsed : null;
    }

    const normalizedLanguage = language && language !== "none" ? language : "";
    if (normalizedLanguage !== initialState.language) {
      data.language = normalizedLanguage || null;
    }

    const trimmedAgeRating = ageRating.trim();
    if (trimmedAgeRating !== initialState.ageRating) {
      data.ageRating = trimmedAgeRating || null;
    }

    // Compare array fields
    const filteredGenres = genres.filter(Boolean);
    if (!arraysEqual(filteredGenres, initialState.genres)) {
      data.genres = filteredGenres;
    }

    const filteredTags = tags.filter(Boolean);
    if (!arraysEqual(filteredTags, initialState.tags)) {
      data.tags = filteredTags;
    }

    // If nothing changed, just close without making a request
    if (Object.keys(data).length === 0) {
      if (closeAfterSave) {
        onOpenChange(false);
      }
      return;
    }

    try {
      await updateSeries.mutateAsync({
        id: seriesData.id,
        data,
      });

      toast.success(t("success"));
      if (closeAfterSave) {
        onOpenChange(false);
      }
    } catch {
      toast.error(t("error"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSave(true);
  };

  const isLoading = updateSeries.isPending || Boolean(isListItem && !fullSeries);

  const showNavigation = seriesIds && seriesIds.length > 1 && onNavigate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <DialogTitle className="flex-1">
              {t("seriesTitle")}
              {showNavigation && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({currentIndex + 1} / {seriesIds.length})
                </span>
              )}
            </DialogTitle>

            {/* Navigation buttons after title */}
            {showNavigation && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handlePrevious}
                  disabled={!hasPrevious || isLoading}
                  title={t("previous")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleNext}
                  disabled={!hasNext || isLoading}
                  title={t("next")}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/* Title and Sort Title */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">{t("fields.title")}</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("fields.titlePlaceholder")}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortTitle">{t("fields.sortTitle")}</Label>
                <Input
                  id="sortTitle"
                  value={sortTitle}
                  onChange={(e) => setSortTitle(e.target.value)}
                  placeholder={t("fields.sortTitlePlaceholder")}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Genres and Tags */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("fields.genres")}</Label>
                <CreatableCombobox
                  options={genreOptions}
                  value={genres}
                  onChange={setGenres}
                  placeholder={t("fields.genresPlaceholder")}
                  searchPlaceholder={t("fields.searchGenres")}
                  emptyText={t("fields.noGenresFound")}
                  createText={t("fields.createGenre")}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("fields.tags")}</Label>
                <CreatableCombobox
                  options={tagOptions}
                  value={tags}
                  onChange={setTags}
                  placeholder={t("fields.tagsPlaceholder")}
                  searchPlaceholder={t("fields.searchTags")}
                  emptyText={t("fields.noTagsFound")}
                  createText={t("fields.createTag")}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>{t("fields.description")}</Label>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder={t("fields.descriptionPlaceholder")}
                disabled={isLoading}
              />
            </div>

            {/* Publisher and Imprint */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("fields.publisher")}</Label>
                <CreatableSelect
                  options={existingPublishers}
                  value={publisher}
                  onChange={setPublisher}
                  placeholder={t("fields.publisherPlaceholder")}
                  searchPlaceholder={t("fields.searchPublisher")}
                  emptyText={t("fields.noPublishersFound")}
                  createText={t("fields.createPublisher")}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="imprint">{t("fields.imprint")}</Label>
                <Input
                  id="imprint"
                  value={imprint}
                  onChange={(e) => setImprint(e.target.value)}
                  placeholder={t("fields.imprintPlaceholder")}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Start Year and Total Issue Count */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startYear">{t("fields.startYear")}</Label>
                <Input
                  id="startYear"
                  type="number"
                  value={startYear}
                  onChange={(e) => setStartYear(e.target.value)}
                  placeholder={t("fields.startYearPlaceholder")}
                  disabled={isLoading}
                  min={1800}
                  max={9999}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalIssueCount">{t("fields.totalIssueCount")}</Label>
                <Input
                  id="totalIssueCount"
                  type="number"
                  value={totalIssueCount}
                  onChange={(e) => setTotalIssueCount(e.target.value)}
                  placeholder={t("fields.totalIssueCountPlaceholder")}
                  disabled={isLoading}
                  min={1}
                />
              </div>
            </div>

            {/* Language and Age Rating */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("fields.language")}</Label>
                <Select
                  value={language}
                  onValueChange={setLanguage}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("fields.languagePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">{t("fields.noLanguage")}</span>
                    </SelectItem>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ageRating">{t("fields.ageRating")}</Label>
                <Input
                  id="ageRating"
                  value={ageRating}
                  onChange={(e) => setAgeRating(e.target.value)}
                  placeholder={t("fields.ageRatingPlaceholder")}
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSave(false)}
              disabled={isLoading}
            >
              {isLoading ? t("saving") : t("save")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t("saving") : t("saveAndClose")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
