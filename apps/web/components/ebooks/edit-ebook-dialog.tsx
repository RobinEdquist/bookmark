"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, X } from "lucide-react";
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
  useUpdateEbookCover,
  type EbookDetail,
  type EbookListItem,
} from "../../lib/use-ebooks";
import { useAuthors, usePublishers, useGenres } from "../../lib/use-audiobooks";
import { useTags } from "../../lib/use-tags";
import {
  SeriesEntryEditor,
  type SeriesEntry,
} from "../shared/series-entry-editor";
import { MetadataMatchDialog } from "../metadata-match/metadata-match-dialog";
import type { MatchedMetadata } from "../metadata-match/mapping";

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
      entry.seriesName === b[i]?.seriesName && entry.order === b[i]?.order,
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
  asin: string;
  genres: string[];
  tags: string[];
  seriesEntries: SeriesEntry[];
}

/** The form's values as they exist on the server, for seeding and diffing. */
function toFormState(ebook: EbookDetail): InitialFormState {
  return {
    title: ebook.title || "",
    subtitle: ebook.subtitle || "",
    description: ebook.description || "",
    authors: ebook.authors.map((a) => a.name),
    publisher: ebook.publisher || "",
    language: ebook.language || "",
    publishedYear: ebook.publishedDate
      ? new Date(ebook.publishedDate).getFullYear().toString()
      : "",
    isbn: ebook.isbn || "",
    asin: ebook.asin || "",
    genres: ebook.genres.map((g) => g.name),
    tags: ebook.tags.map((t) => t.name),
    seriesEntries: ebook.series.map((s) => ({
      seriesName: s.name,
      order: s.order ? String(parseFloat(s.order)) : "",
    })),
  };
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
  // For list items, fetch full details only when dialog is open
  const isListItem = ebook && !("description" in ebook);
  const { data: fullEbook } = useEbook(
    isListItem && ebook && open ? ebook.id : "",
  );

  const ebookData = isListItem ? fullEbook : (ebook as EbookDetail);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        {ebookData ? (
          <EditEbookForm
            key={ebookData.id}
            ebookData={ebookData}
            onOpenChange={onOpenChange}
            ebookIds={ebookIds}
            onNavigate={onNavigate}
          />
        ) : (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The form mounts only once the ebook's details are loaded, so every field seeds
 * from them instead of being pushed in by an effect afterwards. `key` on the id
 * re-mounts it when the arrows move to another ebook, which is the other case
 * the old effect existed to cover. See edit-audiobook-dialog for the same shape.
 */
function EditEbookForm({
  ebookData,
  onOpenChange,
  ebookIds,
  onNavigate,
}: {
  ebookData: EbookDetail;
  onOpenChange: (open: boolean) => void;
  ebookIds?: string[];
  onNavigate?: (ebookId: string) => void;
}) {
  const t = useTranslations("ebooks.edit");
  const updateEbook = useUpdateEbook();
  const updateCover = useUpdateEbookCover();
  const { data: existingAuthors = [] } = useAuthors();
  const { data: existingPublishers = [] } = usePublishers();
  const { data: existingGenres = [] } = useGenres();
  const { data: existingTags = [] } = useTags();

  // What the server currently holds: the seed for every field below, and the
  // baseline handleSave diffs against so only changed fields are sent.
  const initialState: InitialFormState = useMemo(
    () => toFormState(ebookData),
    [ebookData],
  );

  // Form state
  const [title, setTitle] = useState(initialState.title);
  const [subtitle, setSubtitle] = useState(initialState.subtitle);
  const [description, setDescription] = useState(initialState.description);
  const [authors, setAuthors] = useState<string[]>(initialState.authors);
  const [publisher, setPublisher] = useState(initialState.publisher);
  const [language, setLanguage] = useState(initialState.language);
  const [publishedYear, setPublishedYear] = useState(
    initialState.publishedYear,
  );
  const [isbn, setIsbn] = useState(initialState.isbn);
  const [asin, setAsin] = useState(initialState.asin);
  const [genres, setGenres] = useState<string[]>(initialState.genres);
  const [tags, setTags] = useState<string[]>(initialState.tags);
  const [seriesEntries, setSeriesEntries] = useState<SeriesEntry[]>(
    initialState.seriesEntries,
  );

  // External metadata match dialog
  const [matchOpen, setMatchOpen] = useState(false);
  // Cover URL from a metadata match, uploaded after a successful save
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string | null>(null);

  // Convert existing data to combobox options (use ID as key to handle duplicates)
  const authorOptions = existingAuthors.map((a) => ({
    key: a.id,
    value: a.name,
    label: a.name,
  }));

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
  const currentIndex = ebookIds ? ebookIds.indexOf(ebookData.id) : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext =
    currentIndex >= 0 && currentIndex < (ebookIds?.length ?? 0) - 1;

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
  // No `open` guard: this only exists while the dialog does.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not focused on an input element
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
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
  }, [hasPrevious, hasNext, handlePrevious, handleNext]);

  // Apply checked fields from the metadata match dialog to the form state
  const handleMatchApply = (fields: MatchedMetadata) => {
    if (fields.title !== undefined) setTitle(fields.title);
    if (fields.subtitle !== undefined) setSubtitle(fields.subtitle);
    if (fields.description !== undefined) setDescription(fields.description);
    if (fields.authors !== undefined) setAuthors(fields.authors);
    if (fields.publisher !== undefined) setPublisher(fields.publisher);
    if (fields.language !== undefined) setLanguage(fields.language);
    if (fields.publishedYear !== undefined)
      setPublishedYear(fields.publishedYear);
    if (fields.isbn !== undefined) setIsbn(fields.isbn);
    if (fields.asin !== undefined) setAsin(fields.asin);
    if (fields.genres !== undefined) setGenres(fields.genres);
    if (fields.tags !== undefined) setTags(fields.tags);
    if (fields.series !== undefined) setSeriesEntries(fields.series);
    if (fields.coverUrl !== undefined) setPendingCoverUrl(fields.coverUrl);
  };

  const handleSave = async (closeAfterSave: boolean) => {
    const coverUrl = pendingCoverUrl;

    // Build update data with only fields that actually changed
    const data: Record<string, unknown> = {};

    // Compare scalar fields - use null (not undefined) to clear optional values
    // undefined gets stripped from JSON, null is sent explicitly
    // Note: title is required and cannot be null
    const trimmedTitle = title.trim();
    if (trimmedTitle && trimmedTitle !== initialState.title) {
      data.title = trimmedTitle;
    }

    const trimmedSubtitle = subtitle.trim();
    if (trimmedSubtitle !== initialState.subtitle) {
      data.subtitle = trimmedSubtitle || null;
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription !== initialState.description) {
      data.description = trimmedDescription || null;
    }

    const trimmedPublisher = publisher.trim();
    if (trimmedPublisher !== initialState.publisher) {
      data.publisher = trimmedPublisher || null;
    }

    const normalizedLanguage = language && language !== "none" ? language : "";
    if (normalizedLanguage !== initialState.language) {
      data.language = normalizedLanguage || null;
    }

    if (publishedYear !== initialState.publishedYear) {
      data.publishedDate = publishedYear ? `${publishedYear}-01-01` : null;
    }

    const trimmedIsbn = isbn.trim();
    if (trimmedIsbn !== initialState.isbn) {
      data.isbn = trimmedIsbn || null;
    }

    const trimmedAsin = asin.trim();
    if (trimmedAsin !== initialState.asin) {
      data.asin = trimmedAsin || null;
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
    const filteredSeriesEntries = seriesEntries
      .filter((entry) => entry.seriesName.trim())
      .map((entry) => ({
        seriesName: entry.seriesName.trim(),
        order: entry.order.trim() || "0",
      }));
    if (
      !seriesEntriesEqual(filteredSeriesEntries, initialState.seriesEntries)
    ) {
      data.series = filteredSeriesEntries;
    }

    // If nothing changed, just close without making a request
    if (Object.keys(data).length === 0 && !coverUrl) {
      if (closeAfterSave) {
        onOpenChange(false);
      }
      return;
    }

    try {
      if (Object.keys(data).length > 0) {
        await updateEbook.mutateAsync({
          id: ebookData.id,
          data,
        });
      }

      if (coverUrl) {
        try {
          await updateCover.mutateAsync({
            ebookId: ebookData.id,
            url: coverUrl,
          });
          setPendingCoverUrl(null);
        } catch {
          toast.error(t("coverError"));
          return;
        }
      }

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

  const isLoading = updateEbook.isPending || updateCover.isPending;

  const showNavigation = ebookIds && ebookIds.length > 1 && onNavigate;

  return (
    <>
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

          {/* External metadata match */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setMatchOpen(true)}
            disabled={isLoading}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {t("matchMetadata")}
          </Button>

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
                    <span className="text-muted-foreground">
                      {t("fields.noLanguage")}
                    </span>
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

          {/* ASIN */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="asin">{t("fields.asin")}</Label>
              <Input
                id="asin"
                value={asin}
                onChange={(e) => setAsin(e.target.value)}
                placeholder={t("fields.asinPlaceholder")}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Cover pulled in from a metadata match, uploaded on save */}
          {pendingCoverUrl && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                <Image
                  src={pendingCoverUrl}
                  alt={t("pendingCover")}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <p className="flex-1 text-sm text-muted-foreground">
                {t("pendingCover")}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setPendingCoverUrl(null)}
                title={t("removePendingCover")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
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

      {/* Rendered inside DialogContent so clicks in the nested dialog count
        as inside the edit dialog's dismissable layer — as a sibling, the
        click that closes the match dialog dismisses the edit dialog too */}
      <MetadataMatchDialog
        mediaType="ebook"
        open={matchOpen}
        onOpenChange={setMatchOpen}
        current={{
          title,
          subtitle,
          description,
          authors,
          publisher,
          language,
          publishedYear,
          isbn,
          asin,
          genres,
          tags,
          series: seriesEntries,
        }}
        onApply={handleMatchApply}
      />
    </>
  );
}
