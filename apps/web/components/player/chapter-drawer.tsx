"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Play, List } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@repo/ui/components/ui/drawer";
import { cn } from "@repo/ui/lib/utils";
import type { AudiobookChapter } from "../../lib/use-audiobooks";

interface ChapterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: AudiobookChapter[];
  currentChapter: AudiobookChapter | null;
  currentPosition: number;
  isPlaying: boolean;
  onSelectChapter: (chapter: AudiobookChapter) => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function getChapterDuration(
  chapter: AudiobookChapter,
  chapters: AudiobookChapter[],
  totalDuration: number
): number {
  const sorted = [...chapters].sort((a, b) => a.startTime - b.startTime);
  const index = sorted.findIndex((c) => c.id === chapter.id);
  const nextChapter = sorted[index + 1];
  const endTime = chapter.endTime ?? nextChapter?.startTime ?? totalDuration;
  return endTime - chapter.startTime;
}

export function ChapterDrawer({
  open,
  onOpenChange,
  chapters,
  currentChapter,
  currentPosition,
  isPlaying,
  onSelectChapter,
}: ChapterDrawerProps) {
  const t = useTranslations("player");
  const currentChapterRef = useRef<HTMLButtonElement>(null);

  // Sort chapters by startTime
  const sortedChapters = [...chapters].sort((a, b) => a.startTime - b.startTime);

  // Calculate total duration from chapters
  const totalDuration =
    sortedChapters.length > 0
      ? Math.max(
          ...sortedChapters.map((c) => c.endTime ?? c.startTime)
        )
      : 0;

  // Scroll to current chapter when drawer opens
  useEffect(() => {
    if (open && currentChapterRef.current) {
      // Small delay to ensure drawer animation has started
      setTimeout(() => {
        currentChapterRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    }
  }, [open]);

  const handleSelectChapter = (chapter: AudiobookChapter) => {
    onSelectChapter(chapter);
    onOpenChange(false);
  };

  if (chapters.length === 0) {
    return null;
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2">
            <List className="h-5 w-5" />
            {t("chapters")}
          </DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {sortedChapters.map((chapter, index) => {
              const isCurrent = currentChapter?.id === chapter.id;
              const duration = getChapterDuration(
                chapter,
                sortedChapters,
                totalDuration
              );

              return (
                <button
                  key={chapter.id}
                  ref={isCurrent ? currentChapterRef : undefined}
                  onClick={() => handleSelectChapter(chapter)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                    "hover:bg-accent focus:bg-accent focus:outline-none",
                    isCurrent && "bg-accent"
                  )}
                >
                  {/* Chapter number or playing indicator */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {isCurrent && isPlaying ? (
                      <div className="flex items-center gap-0.5">
                        <span className="inline-block h-3 w-0.5 animate-pulse bg-primary" />
                        <span
                          className="inline-block h-4 w-0.5 animate-pulse bg-primary"
                          style={{ animationDelay: "0.1s" }}
                        />
                        <span
                          className="inline-block h-2 w-0.5 animate-pulse bg-primary"
                          style={{ animationDelay: "0.2s" }}
                        />
                      </div>
                    ) : isCurrent ? (
                      <Play className="h-4 w-4 fill-primary text-primary" />
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {index + 1}
                      </span>
                    )}
                  </div>

                  {/* Chapter info */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        isCurrent && "text-primary"
                      )}
                    >
                      {chapter.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(chapter.startTime)}
                      {duration > 0 && ` • ${formatDuration(duration)}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
