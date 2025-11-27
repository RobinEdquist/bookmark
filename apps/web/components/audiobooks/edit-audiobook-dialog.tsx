"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { Switch } from "@repo/ui/components/ui/switch";
import {
  useAudiobook,
  useUpdateAudiobook,
  type AudiobookDetail,
  type AudiobookListItem,
} from "../../lib/use-audiobooks";

interface EditAudiobookDialogProps {
  audiobook: AudiobookListItem | AudiobookDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAudiobookDialog({
  audiobook,
  open,
  onOpenChange,
}: EditAudiobookDialogProps) {
  const t = useTranslations("audiobooks.edit");
  const updateAudiobook = useUpdateAudiobook();

  // For list items, fetch full details
  const isListItem = audiobook && !("description" in audiobook);
  const { data: fullAudiobook } = useAudiobook(
    isListItem && audiobook ? audiobook.id : ""
  );

  const audiobookData = isListItem ? fullAudiobook : (audiobook as AudiobookDetail);

  // Form state
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [authors, setAuthors] = useState("");
  const [narrators, setNarrators] = useState("");
  const [publisher, setPublisher] = useState("");
  const [language, setLanguage] = useState("");
  const [publishedYear, setPublishedYear] = useState("");
  const [genres, setGenres] = useState("");
  const [tags, setTags] = useState("");
  const [isExplicit, setIsExplicit] = useState(false);

  // Reset form when audiobook changes
  useEffect(() => {
    if (audiobookData) {
      setTitle(audiobookData.title || "");
      setSubtitle(audiobookData.subtitle || "");
      setDescription(audiobookData.description || "");
      setAuthors(audiobookData.authors.map((a) => a.name).join(", "));
      setNarrators(audiobookData.narrators.map((n) => n.name).join(", "));
      setPublisher(audiobookData.publisher || "");
      setLanguage(audiobookData.language || "");
      setPublishedYear(
        audiobookData.publishedDate
          ? new Date(audiobookData.publishedDate).getFullYear().toString()
          : ""
      );
      setGenres(audiobookData.genres.map((g) => g.name).join(", "));
      setTags(audiobookData.tags.map((t) => t.name).join(", "));
      setIsExplicit(audiobookData.isExplicit || false);
    }
  }, [audiobookData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!audiobookData) return;

    try {
      await updateAudiobook.mutateAsync({
        id: audiobookData.id,
        data: {
          title: title.trim() || undefined,
          subtitle: subtitle.trim() || undefined,
          description: description.trim() || undefined,
          publisher: publisher.trim() || undefined,
          language: language.trim() || undefined,
          publishedDate: publishedYear ? `${publishedYear}-01-01` : undefined,
          isExplicit,
          authorNames: authors
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          narratorNames: narrators
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          genreNames: genres
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          tagNames: tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });

      toast.success(t("success"));
      onOpenChange(false);
    } catch {
      toast.error(t("error"));
    }
  };

  const isLoading = updateAudiobook.isPending || Boolean(isListItem && !fullAudiobook);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
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

          {/* Subtitle */}
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

          {/* Authors and Narrators */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="authors">{t("fields.authors")}</Label>
              <Input
                id="authors"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder={t("fields.authorsPlaceholder")}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                {t("fields.commaSeparated")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="narrators">{t("fields.narrators")}</Label>
              <Input
                id="narrators"
                value={narrators}
                onChange={(e) => setNarrators(e.target.value)}
                placeholder={t("fields.narratorsPlaceholder")}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                {t("fields.commaSeparated")}
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t("fields.description")}</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("fields.descriptionPlaceholder")}
              disabled={isLoading}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Publisher, Language, Year */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="publisher">{t("fields.publisher")}</Label>
              <Input
                id="publisher"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder={t("fields.publisherPlaceholder")}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">{t("fields.language")}</Label>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder={t("fields.languagePlaceholder")}
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

          {/* Genres and Tags */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="genres">{t("fields.genres")}</Label>
              <Input
                id="genres"
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                placeholder={t("fields.genresPlaceholder")}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                {t("fields.commaSeparated")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">{t("fields.tags")}</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder={t("fields.tagsPlaceholder")}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                {t("fields.commaSeparated")}
              </p>
            </div>
          </div>

          {/* Explicit toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="explicit">{t("fields.explicit")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("fields.explicitDescription")}
              </p>
            </div>
            <Switch
              id="explicit"
              checked={isExplicit}
              onCheckedChange={setIsExplicit}
              disabled={isLoading}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
