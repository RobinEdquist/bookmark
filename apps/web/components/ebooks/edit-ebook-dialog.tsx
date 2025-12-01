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
      setTitle(ebookData.title || "");
      setSubtitle(ebookData.subtitle || "");
      setDescription(ebookData.description || "");
      setAuthors(ebookData.authors.map((a) => a.name));
      setPublisher(ebookData.publisher || "");
      setLanguage(ebookData.language || "");
      setPublishedYear(
        ebookData.publishedDate
          ? new Date(ebookData.publishedDate).getFullYear().toString()
          : ""
      );
      setIsbn(ebookData.isbn || "");
      setGenres(ebookData.genres.map((g) => g.name));
      setTags(ebookData.tags.map((t) => t.name));
    }
  }, [ebookData]);

  const handleSave = async (closeAfterSave: boolean) => {
    if (!ebookData) return;

    try {
      await updateEbook.mutateAsync({
        id: ebookData.id,
        data: {
          title: title.trim() || undefined,
          subtitle: subtitle.trim() || undefined,
          description: description.trim() || undefined,
          publisher: publisher.trim() || undefined,
          language: language && language !== "none" ? language : undefined,
          publishedDate: publishedYear ? `${publishedYear}-01-01` : undefined,
          isbn: isbn.trim() || undefined,
          authorNames: authors.filter(Boolean),
          genreNames: genres.filter(Boolean),
          tagNames: tags.filter(Boolean),
        },
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
