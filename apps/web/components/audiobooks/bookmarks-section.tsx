"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { Bookmark, Pencil, Play } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Label } from "@repo/ui/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { usePlayer } from "../providers/player-provider";
import { formatTimestamp } from "../../lib/format-timestamp";
import {
  useAudiobookBookmarks,
  type AudiobookBookmark,
} from "../../lib/use-bookmarks";
import { useBookmarkPlayConfirmDismissed } from "../../lib/use-bookmark-play-confirm-dismissed";
import type { AudiobookDetail } from "../../lib/use-audiobooks";
import type { AudiobookProgress } from "../../lib/use-progress";
import { EditBookmarkDialog } from "./edit-bookmark-dialog";

/**
 * Jumps within ±10s of the saved progress are effectively "resume from where
 * I was" — no point warning that progress will move.
 */
const PROGRESS_WARNING_THRESHOLD_SECONDS = 10;

interface BookmarksSectionProps {
  audiobook: AudiobookDetail;
  progress: AudiobookProgress | undefined;
}

/**
 * The user's bookmarks for this audiobook, rendered above the chapters
 * section. Personal content: the section renders nothing until the query
 * resolves with at least one bookmark.
 */
export function BookmarksSection({
  audiobook,
  progress,
}: BookmarksSectionProps) {
  const t = useTranslations("audiobooks.detail.bookmarks");
  const { data: bookmarks } = useAudiobookBookmarks(audiobook.id);
  const {
    audiobook: currentlyPlaying,
    isPlaying,
    play,
    resume,
    seek,
  } = usePlayer();

  const [sectionOpen, setSectionOpen] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<AudiobookBookmark | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingPlay, setPendingPlay] = useState<AudiobookBookmark | null>(
    null,
  );
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [confirmDismissed, setConfirmDismissed] =
    useBookmarkPlayConfirmDismissed();

  if (!bookmarks || bookmarks.length === 0) {
    return null;
  }

  const startPlayback = (bookmark: AudiobookBookmark) => {
    play(audiobook, bookmark.position);
  };

  const handlePlay = (bookmark: AudiobookBookmark) => {
    // Same book already in the player: plain seek, exactly like chapter clicks
    if (currentlyPlaying?.id === audiobook.id) {
      seek(bookmark.position);
      if (!isPlaying) {
        resume();
      }
      return;
    }

    const movesProgress =
      !!progress &&
      progress.position > 0 &&
      Math.abs(progress.position - bookmark.position) >
        PROGRESS_WARNING_THRESHOLD_SECONDS;

    if (movesProgress && !confirmDismissed) {
      setPendingPlay(bookmark);
      return;
    }

    startPlayback(bookmark);
  };

  const handleConfirmPlay = () => {
    if (!pendingPlay) return;
    if (dontAskAgain) {
      setConfirmDismissed(true);
    }
    startPlayback(pendingPlay);
    setPendingPlay(null);
  };

  const handleEdit = (bookmark: AudiobookBookmark) => {
    setEditing(bookmark);
    setEditOpen(true);
  };

  return (
    <>
      <Accordion
        type="single"
        collapsible
        className="w-full"
        value={sectionOpen}
        onValueChange={setSectionOpen}
      >
        <AccordionItem value="bookmarks" className="border-b-0">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <Bookmark className="h-4 w-4" />
              {t("title")} ({bookmarks.length})
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="rounded-lg border border-border/50 mt-2 overflow-hidden">
              <AnimatePresence mode="sync">
                {sectionOpen === "bookmarks" &&
                  bookmarks.map((bookmark, index) => {
                    const staggerDelay = Math.min(index * 0.03, 0.5);

                    return (
                      <motion.div
                        key={bookmark.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{
                          duration: 0.2,
                          delay: staggerDelay,
                          ease: [0.32, 0.72, 0, 1],
                        }}
                        className={`flex items-center gap-3 px-4 py-3 ${
                          index !== bookmarks.length - 1
                            ? "border-b border-border/50"
                            : ""
                        }`}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handlePlay(bookmark)}
                          aria-label={t("playFrom", {
                            time: formatTimestamp(bookmark.position),
                          })}
                        >
                          <Play className="h-4 w-4" aria-hidden="true" />
                        </Button>

                        <div className="min-w-0 flex-1">
                          {bookmark.note ? (
                            <>
                              <p className="text-sm line-clamp-2">
                                {bookmark.note}
                              </p>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                {formatTimestamp(bookmark.position)}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm tabular-nums">
                              {formatTimestamp(bookmark.position)}
                            </p>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => handleEdit(bookmark)}
                          aria-label={t("edit")}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </motion.div>
                    );
                  })}
              </AnimatePresence>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <EditBookmarkDialog
        bookmark={editing}
        open={editOpen}
        onOpenChange={setEditOpen}
        duration={audiobook.duration}
      />

      <AlertDialog
        open={pendingPlay !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPlay(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("playConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("playConfirmDescription", {
                time: formatTimestamp(pendingPlay?.position ?? 0),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id="bookmark-play-dont-ask"
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            <Label
              htmlFor="bookmark-play-dont-ask"
              className="text-sm font-normal text-muted-foreground"
            >
              {t("playConfirmDontAskAgain")}
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("playConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPlay}>
              {t("playConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
