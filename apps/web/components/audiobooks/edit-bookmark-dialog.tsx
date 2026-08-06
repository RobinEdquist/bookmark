"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { TimestampField } from "../common/timestamp-field";
import {
  useDeleteBookmark,
  useUpdateBookmark,
  type AudiobookBookmark,
} from "../../lib/use-bookmarks";
import { BOOKMARK_NOTE_MAX_LENGTH } from "../player/bookmark-form";

interface EditBookmarkDialogProps {
  bookmark: AudiobookBookmark | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Audiobook duration in seconds, when known. */
  duration: number | null;
}

/**
 * Edit a bookmark's note and timestamp. Delete lives here too — a bookmark is
 * cheap to recreate, so no extra confirmation step.
 */
export function EditBookmarkDialog({
  bookmark,
  open,
  onOpenChange,
  duration,
}: EditBookmarkDialogProps) {
  const t = useTranslations("audiobooks.detail.bookmarks");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        {/* The form mounts fresh each time the dialog opens, so its state
            initializers re-read the bookmark — no reset effects needed. */}
        {bookmark && (
          <EditBookmarkForm
            bookmark={bookmark}
            duration={duration}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditBookmarkForm({
  bookmark,
  duration,
  onClose,
}: {
  bookmark: AudiobookBookmark;
  duration: number | null;
  onClose: () => void;
}) {
  const t = useTranslations("audiobooks.detail.bookmarks");
  const tActions = useTranslations("common.actions");
  const updateBookmark = useUpdateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const [note, setNote] = useState(bookmark.note ?? "");
  const [position, setPosition] = useState<number | null>(bookmark.position);

  const isPending = updateBookmark.isPending || deleteBookmark.isPending;

  const handleSave = () => {
    if (position === null || isPending) return;

    updateBookmark.mutate(
      {
        audiobookId: bookmark.audiobookId,
        bookmarkId: bookmark.id,
        position,
        // An empty string clears the note server-side
        note: note.trim(),
      },
      {
        onSuccess: () => {
          toast.success(t("updated"));
          onClose();
        },
        onError: () => {
          toast.error(t("updateError"));
        },
      },
    );
  };

  const handleDelete = () => {
    if (isPending) return;

    deleteBookmark.mutate(
      { audiobookId: bookmark.audiobookId, bookmarkId: bookmark.id },
      {
        onSuccess: () => {
          toast.success(t("deleted"));
          onClose();
        },
        onError: () => {
          toast.error(t("deleteError"));
        },
      },
    );
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-bookmark-note">{t("note")}</Label>
          <Textarea
            id="edit-bookmark-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("notePlaceholder")}
            maxLength={BOOKMARK_NOTE_MAX_LENGTH}
            rows={4}
            disabled={isPending}
          />
        </div>

        <TimestampField
          id="edit-bookmark-timestamp"
          initialSeconds={bookmark.position}
          max={duration}
          disabled={isPending}
          onParsedChange={setPosition}
        />
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          type="button"
          variant="destructive"
          onClick={handleDelete}
          loading={deleteBookmark.isPending}
          disabled={updateBookmark.isPending}
        >
          {tActions("delete")}
        </Button>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
          >
            {tActions("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            loading={updateBookmark.isPending}
            disabled={position === null || deleteBookmark.isPending}
          >
            {tActions("save")}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
