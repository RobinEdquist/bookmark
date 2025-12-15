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

// Common ebook languages (ISO 639-1 codes)
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
  useEbook,
  useUpdateEbook,
  type EbookDetail,
  type EbookListItem,
} from "../../lib/use-ebooks";
import {
  useAuthors,
  usePublishers,
  useGenres,
  useTags,
} from "../../lib/use-audiobooks";
import {
  SeriesEntryEditor,
  type SeriesEntry,
} from "../shared/series-entry-editor";

// Helper to compare arrays by value
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

// Helper to compare series entries arrays
function seriesEntriesEqual(a: SeriesEntry[], b: SeriesEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (entry, i) =>
      entry.seriesName === b[i]?.seriesName && entry.order === b[i]?.order
  );
}

// Interface for tracking initial form state
interface InitialFormState {
  title: string;
  subtitle: string;
  description: string;
  authors: string[];
  publisher: string;
  language: string;
  publishedYear: string;
  isbn: string;
  genres: string[];
  tags: string[];
  seriesEntries: SeriesEntry[];
}

interface EditEbookDialogProps {
  ebook: EbookListItem | EbookDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** List of ebook IDs for next/previous navigation */
  ebookIds?: string[];
  /** Callback when navigating to a different ebook */
  onNavigate?: (ebookId: string) => void;
}

export function EditEbookDialog({
  ebook,
  open,
  onOpenChange,
  ebookIds,
  onNavigate,
}: EditEbookDialogProps) {
  const t = useTranslations("ebooks.edit");
  const updateEbook = useUpdateEbook();
  const { data: existingAuthors = [] } = useAuthors();
  const { data: existingPublishers = [] } = usePublishers();
  const { data: existingGenres = [] } = useGenres();
  const { data: existingTags = [] } = useTags();

  // For list items, fetch full details only when dialog is open
  const isListItem = ebook && !("description" in ebook);
  const { data: fullEbook } = useEbook(
    isListItem && ebook && open ? ebook.id : ""
  );

  const ebookData = isListItem ? fullEbook : (ebook as EbookDetail);

  // Form state
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [authors, setAuthors] = useState<string[]>([]);
  const [publisher, setPublisher] = useState("");
  const [language, setLanguage] = useState("");
  const [publishedYear, setPublishedYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [seriesEntries, setSeriesEntries] = useState<SeriesEntry[]>([]);

  // Track initial values to detect which fields actually changed
  const [initialState, setInitialState] = useState<InitialFormState | null>(null);

  // Convert existing data to combobox options
  const authorOptions = existingAuthors.map((a) => ({
    value: a.name,
    label: a.name,
  }));

  const genreOptions = existingGenres.map((g) => ({
    value: g.name,
    label: g.name,
  }));

  const tagOptions = existingTags.map((t) => ({
    value: t.name,
    label: t.name,
  }));

  // Navigation logic
  const currentIndex = ebook && ebookIds
    ? ebookIds.indexOf(ebook.id)
    : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < (ebookIds?.length ?? 0) - 1;

  const handlePrevious = useCallback(() => {
    if (hasPrevious && ebookIds && onNavigate) {
      const prevId = ebookIds[currentIndex - 1];
      if (prevId) onNavigate(prevId);
    }
  }, [hasPrevious, ebookIds, currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext && ebookIds && onNavigate) {
      const nextId = ebookIds[currentIndex + 1];
      if (nextId) onNavigate(nextId);
    }
  }, [hasNext, ebookIds, currentIndex, onNavigate]);

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

  // Reset form when ebook changes
  useEffect(() => {
    if (ebookData) {
      const titleVal = ebookData.title || "";
      const subtitleVal = ebookData.subtitle || "";
      const descriptionVal = ebookData.description || "";
      const authorsVal = ebookData.authors.map((a) => a.name);
      const publisherVal = ebookData.publisher || "";
      const languageVal = ebookData.language || "";
      const publishedYearVal = ebookData.publishedDate
        ? new Date(ebookData.publishedDate).getFullYear().toString()
        : "";
      const isbnVal = ebookData.isbn || "";
      const genresVal = ebookData.genres.map((g) => g.name);
      const tagsVal = ebookData.tags.map((t) => t.name);
      const seriesEntriesVal: SeriesEntry[] = ebookData.series.map((s) => ({
        seriesName: s.name,
        order: s.order ? String(parseFloat(s.order)) : "",
      }));

      // Set form values
      setTitle(titleVal);
      setSubtitle(subtitleVal);
      setDescription(descriptionVal);
      setAuthors(authorsVal);
      setPublisher(publisherVal);
      setLanguage(languageVal);
      setPublishedYear(publishedYearVal);
      setIsbn(isbnVal);
      setGenres(genresVal);
      setTags(tagsVal);
      setSeriesEntries(seriesEntriesVal);

      // Store initial state for change detection
      setInitialState({
        title: titleVal,
        subtitle: subtitleVal,
        description: descriptionVal,
        authors: authorsVal,
        publisher: publisherVal,
        language: languageVal,
        publishedYear: publishedYearVal,
        isbn: isbnVal,
        genres: genresVal,
        tags: tagsVal,
        seriesEntries: seriesEntriesVal,
      });
    }
  }, [ebookData]);

  const handleSave = async (closeAfterSave: boolean) => {
    if (!ebookData || !initialState) return;

    // Build update data with only fields that actually changed
    const data: Record<string, unknown> = {};

    // Compare scalar fields
    const trimmedTitle = title.trim();
    if (trimmedTitle !== initialState.title) {
      data.title = trimmedTitle || undefined;
    }

    const trimmedSubtitle = subtitle.trim();
    if (trimmedSubtitle !== initialState.subtitle) {
      data.subtitle = trimmedSubtitle || undefined;
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription !== initialState.description) {
      data.description = trimmedDescription || undefined;
    }

    const trimmedPublisher = publisher.trim();
    if (trimmedPublisher !== initialState.publisher) {
      data.publisher = trimmedPublisher || undefined;
    }

    const normalizedLanguage = language && language !== "none" ? language : "";
    if (normalizedLanguage !== initialState.language) {
      data.language = normalizedLanguage || undefined;
    }

    if (publishedYear !== initialState.publishedYear) {
      data.publishedDate = publishedYear ? `${publishedYear}-01-01` : undefined;
    }

    const trimmedIsbn = isbn.trim();
    if (trimmedIsbn !== initialState.isbn) {
      data.isbn = trimmedIsbn || undefined;
    }

    // Compare array fields
    const filteredAuthors = authors.filter(Boolean);
    if (!arraysEqual(filteredAuthors, initialState.authors)) {
      data.authorNames = filteredAuthors;
    }

    const filteredGenres = genres.filter(Boolean);
    if (!arraysEqual(filteredGenres, initialState.genres)) {
      data.genreNames = filteredGenres;
    }

    const filteredTags = tags.filter(Boolean);
    if (!arraysEqual(filteredTags, initialState.tags)) {
      data.tagNames = filteredTags;
    }

    // Compare series entries
    const filteredSeriesEntries = seriesEntries.filter(
      (entry) => entry.seriesName.trim() && entry.order.trim()
    );
    if (!seriesEntriesEqual(filteredSeriesEntries, initialState.seriesEntries)) {
      data.series = filteredSeriesEntries;
    }

    // If nothing changed, just close without making a request
    if (Object.keys(data).length === 0) {
      if (closeAfterSave) {
        onOpenChange(false);
      }
      return;
    }

    try {
      await updateEbook.mutateAsync({
        id: ebookData.id,
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

  const isLoading = updateEbook.isPending || Boolean(isListItem && !fullEbook);

  const showNavigation = ebookIds && ebookIds.length > 1 && onNavigate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <DialogTitle className="flex-1">
              {t("title")}
              {showNavigation && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({currentIndex + 1} / {ebookIds.length})
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
          {/* Title and Subtitle */}
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
              <Label htmlFor="subtitle">{t("fields.subtitle")}</Label>
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder={t("fields.subtitlePlaceholder")}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Authors */}
          <div className="space-y-2">
            <Label>{t("fields.authors")}</Label>
            <CreatableCombobox
              options={authorOptions}
              value={authors}
              onChange={setAuthors}
              placeholder={t("fields.authorsPlaceholder")}
              searchPlaceholder={t("fields.searchAuthors")}
              emptyText={t("fields.noAuthorsFound")}
              createText={t("fields.createAuthor")}
              disabled={isLoading}
            />
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

          {/* Series */}
          <SeriesEntryEditor
            value={seriesEntries}
            onChange={setSeriesEntries}
            disabled={isLoading}
            labels={{
              series: t("fields.series"),
              addSeries: t("fields.addSeries"),
              order: t("fields.seriesOrder"),
              orderPlaceholder: t("fields.seriesOrderPlaceholder"),
              searchSeries: t("fields.searchSeries"),
              noSeriesFound: t("fields.noSeriesFound"),
              createSeries: t("fields.createSeries"),
              removeSeries: t("fields.removeSeries"),
            }}
          />

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

          {/* Publisher and Year */}
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
              <Label htmlFor="publishedYear">{t("fields.publishedYear")}</Label>
              <Input
                id="publishedYear"
                type="number"
                value={publishedYear}
                onChange={(e) => setPublishedYear(e.target.value)}
                placeholder={t("fields.publishedYearPlaceholder")}
                disabled={isLoading}
                min={1000}
                max={9999}
              />
            </div>
          </div>

          {/* Language and ISBN */}
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
              <Label htmlFor="isbn">{t("fields.isbn")}</Label>
              <Input
                id="isbn"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder={t("fields.isbnPlaceholder")}
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
