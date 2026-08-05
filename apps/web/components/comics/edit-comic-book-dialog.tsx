"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
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
import { Textarea } from "@repo/ui/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

import {
  useComicBook,
  useUpdateComicBook,
  type ComicBookDetail,
  type ComicBookFormat,
  type ComicCreatorRole,
} from "../../lib/use-comics";
import { isCollectedEdition } from "../../lib/comic-format";
import { parseCollects, formatIssueList } from "../../lib/comic-issue-list";

const COVER_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const FORMATS: ComicBookFormat[] = [
  "single_issue",
  "annual",
  "tpb",
  "omnibus",
  "compendium",
  "one_shot",
  "special",
  "graphic_novel",
  "other",
];

const ROLES: ComicCreatorRole[] = [
  "writer",
  "penciller",
  "inker",
  "colorist",
  "letterer",
  "cover_artist",
  "editor",
  "other",
];

interface CreatorRow {
  /** Stable client-side identity for React keys (not sent to the backend) */
  id: number;
  name: string;
  role: ComicCreatorRole;
}

interface InitialFormState {
  title: string;
  number: string;
  format: ComicBookFormat;
  coverDate: string;
  summary: string;
  collects: string;
  creators: CreatorRow[];
}

interface EditComicBookDialogProps {
  bookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Compares creators by value (name/role only) — the client-side `id` is ignored.
function creatorsEqual(a: CreatorRow[], b: CreatorRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) => row.name === b[i]?.name && row.role === b[i]?.role,
  );
}

/**
 * The form's values as they exist on the server, for seeding and diffing.
 * Creator rows get client-side ids so they survive reordering and removal
 * without relying on array position; the seeded rows simply take 0..n-1, and
 * rows added later continue from there (see nextCreatorId).
 */
function toFormState(book: ComicBookDetail): InitialFormState {
  return {
    title: book.title ?? "",
    number: book.number ?? "",
    format: book.format,
    coverDate: book.coverDate ?? "",
    summary: book.summary ?? "",
    collects: book.collects ?? "",
    creators: [...book.creators]
      .sort((a, b) => a.order - b.order)
      .map((c, index) => ({ id: index, name: c.name, role: c.role })),
  };
}

export function EditComicBookDialog({
  bookId,
  open,
  onOpenChange,
}: EditComicBookDialogProps) {
  const { data: book } = useComicBook(open ? bookId : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        {book ? (
          <EditComicBookForm
            key={book.id}
            book={book}
            onOpenChange={onOpenChange}
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
 * The form mounts only once the book is loaded, so every field seeds from it
 * instead of being pushed in by an effect afterwards. That removes both of this
 * dialog's effects: the field reset, and a second one whose only job was to
 * clear the cover-date error on close — state that no longer outlives the
 * dialog, because DialogContent unmounts while closed.
 */
function EditComicBookForm({
  book,
  onOpenChange,
}: {
  book: ComicBookDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("comics.edit");
  const tFormat = useTranslations("comics.format");
  const tRole = useTranslations("comics.role");

  const updateBook = useUpdateComicBook();

  // What the server currently holds: the seed for every field below, and the
  // baseline handleSave diffs against so only changed fields are sent.
  const [initialState] = useState<InitialFormState>(() => toFormState(book));

  // Monotonic counter for creator rows added after the seeded ones. Only ever
  // read and bumped from event handlers, never during render.
  const nextCreatorId = useRef(initialState.creators.length);

  // Form state
  const [title, setTitle] = useState(initialState.title);
  const [number, setNumber] = useState(initialState.number);
  const [format, setFormat] = useState<ComicBookFormat>(initialState.format);
  const [coverDate, setCoverDate] = useState(initialState.coverDate);
  const [coverDateError, setCoverDateError] = useState<string | null>(null);
  const [summary, setSummary] = useState(initialState.summary);
  const [collects, setCollects] = useState(initialState.collects);
  const [creators, setCreators] = useState<CreatorRow[]>(
    initialState.creators,
  );

  const collectsParsed = parseCollects(collects);
  const collectsInvalid =
    isCollectedEdition(format) && collectsParsed.unrecognized.length > 0;

  const validateCoverDate = (value: string): boolean => {
    if (value === "" || COVER_DATE_REGEX.test(value)) {
      setCoverDateError(null);
      return true;
    }
    setCoverDateError(t("fields.coverDateError"));
    return false;
  };

  const handleCoverDateChange = (value: string) => {
    setCoverDate(value);
    if (coverDateError) {
      validateCoverDate(value);
    }
  };

  const handleAddCreator = () => {
    setCreators((prev) => [
      ...prev,
      { id: nextCreatorId.current++, name: "", role: "writer" },
    ]);
  };

  const handleRemoveCreator = (id: number) => {
    setCreators((prev) => prev.filter((row) => row.id !== id));
  };

  const handleCreatorNameChange = (id: number, value: string) => {
    setCreators((prev) =>
      prev.map((row) => (row.id === id ? { ...row, name: value } : row)),
    );
  };

  const handleCreatorRoleChange = (id: number, value: ComicCreatorRole) => {
    setCreators((prev) =>
      prev.map((row) => (row.id === id ? { ...row, role: value } : row)),
    );
  };

  const handleSave = async (closeAfterSave: boolean) => {
    if (collectsInvalid) return;

    // Validate cover date before saving
    if (!validateCoverDate(coverDate)) return;

    // Build update payload — only changed fields
    const data: Record<string, unknown> = {};

    const trimmedTitle = title.trim();
    if (trimmedTitle !== initialState.title) {
      data.title = trimmedTitle || null;
    }

    const trimmedNumber = number.trim();
    if (trimmedNumber !== initialState.number) {
      data.number = trimmedNumber || null;
    }

    if (format !== initialState.format) {
      data.format = format;
    }

    const trimmedCoverDate = coverDate.trim();
    if (trimmedCoverDate !== initialState.coverDate) {
      data.coverDate = trimmedCoverDate || null;
    }

    const trimmedSummary = summary.trim();
    if (trimmedSummary !== initialState.summary) {
      data.summary = trimmedSummary || null;
    }

    // collects is only meaningful for collected editions; for other formats
    // treat it as empty so a stray/invalid value is cleared, never sent.
    const trimmedCollects = isCollectedEdition(format) ? collects.trim() : "";
    if (trimmedCollects !== initialState.collects) {
      data.collects = trimmedCollects || null;
    }

    // Creators — send when modified (backend replaces the full set)
    const filteredCreators = creators.filter((c) => c.name.trim() !== "");
    if (!creatorsEqual(filteredCreators, initialState.creators)) {
      data.creators = filteredCreators.map((c) => ({
        name: c.name.trim(),
        role: c.role,
      }));
    }

    if (Object.keys(data).length === 0) {
      if (closeAfterSave) onOpenChange(false);
      return;
    }

    try {
      await updateBook.mutateAsync({ id: book.id, data });
      toast.success(t("bookSuccess"));
      if (closeAfterSave) onOpenChange(false);
    } catch {
      toast.error(t("bookError"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSave(true);
  };

  const isLoading = updateBook.isPending;

  return (
    <>
    <DialogHeader className="shrink-0 border-b px-6 py-4">
      <DialogTitle>{t("bookTitle")}</DialogTitle>
    </DialogHeader>

    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {/* Number and Format */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="book-number">{t("fields.number")}</Label>
            <Input
              id="book-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="#1"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="book-format">{t("fields.format")}</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as ComicBookFormat)}
              disabled={isLoading}
            >
              <SelectTrigger id="book-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {tFormat(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="book-title">{t("fields.title")}</Label>
          <Input
            id="book-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("fields.titlePlaceholder")}
            disabled={isLoading}
          />
        </div>

        {/* Cover Date */}
        <div className="space-y-2">
          <Label htmlFor="book-coverDate">{t("fields.coverDate")}</Label>
          <Input
            id="book-coverDate"
            value={coverDate}
            onChange={(e) => handleCoverDateChange(e.target.value)}
            onBlur={() => validateCoverDate(coverDate)}
            placeholder="YYYY-MM-DD"
            disabled={isLoading}
            aria-invalid={!!coverDateError}
            aria-describedby={
              coverDateError ? "book-coverDate-error" : undefined
            }
          />
          {coverDateError && (
            <p
              id="book-coverDate-error"
              className="text-sm text-destructive"
            >
              {coverDateError}
            </p>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-2">
          <Label htmlFor="book-summary">{t("fields.summary")}</Label>
          <Textarea
            id="book-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={t("fields.descriptionPlaceholder")}
            disabled={isLoading}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Collects — shown only for collected editions */}
        {isCollectedEdition(format) && (
          <div className="space-y-2">
            <Label htmlFor="book-collects">{t("fields.collects")}</Label>
            <Input
              id="book-collects"
              value={collects}
              onChange={(e) => setCollects(e.target.value)}
              placeholder={t("fields.collectsPlaceholder")}
              disabled={isLoading}
            />
            {collects.trim() !== "" &&
              collectsParsed.presentInts.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("fields.collectsPreview", {
                    issues: formatIssueList(collectsParsed.presentInts),
                    count: collectsParsed.presentInts.length,
                  })}
                </p>
              )}
            {collectsParsed.unrecognized.length > 0 && (
              <p className="text-xs text-destructive">
                {t("fields.collectsUnrecognized", {
                  tokens: collectsParsed.unrecognized.join(", "),
                })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("fields.collectsHelp")}
            </p>
          </div>
        )}

        {/* Creators repeatable editor */}
        <div className="space-y-3">
          <Label>{t("fields.creators")}</Label>

          {creators.map((row, index) => (
            <div key={row.id} className="flex items-center gap-2">
              <Input
                value={row.name}
                onChange={(e) =>
                  handleCreatorNameChange(row.id, e.target.value)
                }
                placeholder={t("fields.creatorName")}
                disabled={isLoading}
                className="flex-1"
                aria-label={`${t("fields.creatorName")} ${index + 1}`}
              />
              <Select
                value={row.role}
                onValueChange={(v) =>
                  handleCreatorRoleChange(row.id, v as ComicCreatorRole)
                }
                disabled={isLoading}
              >
                <SelectTrigger
                  className="w-40 shrink-0"
                  aria-label={`${t("fields.creatorRole")} ${index + 1}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {tRole(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveCreator(row.id)}
                disabled={isLoading}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={t("fields.removeCreator")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCreator}
            disabled={isLoading}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {t("fields.addCreator")}
          </Button>
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
          disabled={isLoading || collectsInvalid}
        >
          {isLoading ? t("saving") : t("save")}
        </Button>
        <Button type="submit" disabled={isLoading || collectsInvalid}>
          {isLoading ? t("saving") : t("saveAndClose")}
        </Button>
      </DialogFooter>
    </form>
    </>
  );
}
