"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { TimestampField } from "../common/timestamp-field";
import { useCreateBookmark, generateBookmarkId } from "../../lib/use-bookmarks";

export const BOOKMARK_NOTE_MAX_LENGTH = 2000;

interface BookmarkFormProps {
  /** Captured when the form was opened — not read live from the player. */
  audiobookId: string;
  /** Position frozen at the moment the bookmark button was pressed. */
  initialPosition: number;
  /** Audiobook duration in seconds, when known. */
  duration: number | null;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * Quick-capture form shared by the desktop popover and the mobile drawer.
 * Playback keeps running while it is open; the timestamp stays frozen at the
 * captured position until the user adjusts it.
 */
export function BookmarkForm({
  audiobookId,
  initialPosition,
  duration,
  onSaved,
  onCancel,
}: BookmarkFormProps) {
  const t = useTranslations("player");
  const tActions = useTranslations("common.actions");
  const createBookmark = useCreateBookmark();

  const [note, setNote] = useState("");
  const [position, setPosition] = useState<number | null>(initialPosition);
  // One id per form-open: replaying the create (double-click, flaky network
  // retry) hits the server's idempotent path instead of inserting twice.
  const [bookmarkId] = useState(generateBookmarkId);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (position === null || createBookmark.isPending) return;

    const trimmedNote = note.trim();
    createBookmark.mutate(
      {
        audiobookId,
        position,
        ...(trimmedNote && { note: trimmedNote }),
        ...(bookmarkId && { id: bookmarkId }),
      },
      {
        onSuccess: () => {
          toast.success(t("bookmarkSaved"));
          onSaved();
        },
        onError: () => {
          toast.error(t("bookmarkSaveError"));
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bookmark-note">{t("bookmarkNote")}</Label>
        <Input
          id="bookmark-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("bookmarkNotePlaceholder")}
          maxLength={BOOKMARK_NOTE_MAX_LENGTH}
          autoFocus
          autoComplete="off"
          disabled={createBookmark.isPending}
        />
      </div>

      <TimestampField
        id="bookmark-timestamp"
        initialSeconds={initialPosition}
        max={duration}
        disabled={createBookmark.isPending}
        onParsedChange={setPosition}
      />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={createBookmark.isPending}
        >
          {tActions("cancel")}
        </Button>
        <Button
          type="submit"
          size="sm"
          loading={createBookmark.isPending}
          disabled={position === null}
        >
          {t("bookmarkSave")}
        </Button>
      </div>
    </form>
  );
}
