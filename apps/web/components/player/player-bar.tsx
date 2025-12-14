"use client";

import { useCallback, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  List,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Slider } from "@repo/ui/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";
import { Marquee } from "@repo/ui/components/ui/marquee";
import { usePlayer } from "../providers/player-provider";
import { ChapterDrawer } from "./chapter-drawer";
import { SpeedDrawer } from "./speed-drawer";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SKIP_BACKWARD_SECONDS = 15;
const SKIP_FORWARD_SECONDS = 30;

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerBar() {
  const t = useTranslations("player");
  const {
    audiobook,
    isPlaying,
    isLoading,
    currentPosition,
    duration,
    currentChapter,
    playbackRate,
    volume,
    pause,
    resume,
    stop,
    seek,
    seekPreview,
    seekStart,
    seekEnd,
    seekRelative,
    setPlaybackRate,
    setVolume,
    nextChapter,
    prevChapter,
  } = usePlayer();

  // Drawer states
  const [isChapterDrawerOpen, setIsChapterDrawerOpen] = useState(false);
  const [isSpeedDrawerOpen, setIsSpeedDrawerOpen] = useState(false);

  // Progress mode: 'book' shows total book progress, 'chapter' shows current chapter progress
  const [progressMode, setProgressMode] = useState<"book" | "chapter">("book");

  // Calculate chapter-relative progress values
  const chapterProgress = useMemo(() => {
    if (!currentChapter || !audiobook?.chapters) {
      return { position: 0, duration: 0 };
    }

    const sortedChapters = [...audiobook.chapters].sort(
      (a, b) => a.startTime - b.startTime
    );
    const chapterIndex = sortedChapters.findIndex(
      (c) => c.id === currentChapter.id
    );
    const nextChapterItem = sortedChapters[chapterIndex + 1];
    const chapterEndTime =
      currentChapter.endTime ?? nextChapterItem?.startTime ?? duration;

    const chapterPosition = currentPosition - currentChapter.startTime;
    const chapterDuration = chapterEndTime - currentChapter.startTime;

    return {
      position: Math.max(0, chapterPosition),
      duration: Math.max(0, chapterDuration),
    };
  }, [currentChapter, currentPosition, duration, audiobook?.chapters]);

  // Determine which values to use for the slider based on progress mode
  const hasChapters = (audiobook?.chapters?.length ?? 0) > 0;
  const isChapterMode = progressMode === "chapter" && hasChapters && currentChapter;
  const sliderPosition = isChapterMode ? chapterProgress.position : currentPosition;
  const sliderMax = isChapterMode ? chapterProgress.duration : duration;

  // Called when user starts dragging - prevents timeupdate from overriding position
  const handleSeekStart = useCallback(() => {
    seekStart();
  }, [seekStart]);

  // Convert slider position to absolute position (for chapter mode)
  const toAbsolutePosition = useCallback(
    (sliderValue: number): number => {
      if (isChapterMode && currentChapter) {
        return currentChapter.startTime + sliderValue;
      }
      return sliderValue;
    },
    [isChapterMode, currentChapter]
  );

  // Called during dragging - updates audio position without syncing to server
  const handleSeekPreview = useCallback(
    (value: number[]) => {
      const position = value[0];
      if (position !== undefined) {
        seekPreview(toAbsolutePosition(position));
      }
    },
    [seekPreview, toAbsolutePosition]
  );

  // Called when user releases the slider - syncs progress to server
  const handleSeekCommit = useCallback(
    (value: number[]) => {
      seekEnd(); // Re-enable timeupdate
      const position = value[0];
      if (position !== undefined) {
        seek(toAbsolutePosition(position));
      }
    },
    [seek, seekEnd, toAbsolutePosition]
  );

  // Handle chapter selection from drawer
  const handleSelectChapter = useCallback(
    (chapter: { startTime: number }) => {
      seek(chapter.startTime);
    },
    [seek]
  );

  // Toggle progress mode
  const toggleProgressMode = useCallback(() => {
    setProgressMode((prev) => (prev === "book" ? "chapter" : "book"));
  }, []);

  const handleVolumeChange = useCallback(
    (value: number[]) => {
      const vol = value[0];
      if (vol !== undefined) {
        setVolume(vol);
      }
    },
    [setVolume]
  );

  const toggleMute = useCallback(() => {
    setVolume(volume > 0 ? 0 : 1);
  }, [volume, setVolume]);

  const progress = duration > 0 ? (currentPosition / duration) * 100 : 0;

  // Don't render if no audiobook is loaded
  if (!audiobook) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="player-bar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 overflow-hidden"
        >
        {/* Progress bar at top */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex h-16 items-center gap-2 px-3 sm:gap-4 sm:px-4 lg:px-6">
          {/* Book info - left side */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {/* Cover */}
            <Link
              href={`/audiobooks/${audiobook.id}`}
              className="shrink-0 overflow-hidden rounded-md"
            >
              {audiobook.coverUrl ? (
                <Image
                  src={audiobook.coverUrl}
                  alt={audiobook.title}
                  width={48}
                  height={48}
                  className="h-10 w-10 sm:h-12 sm:w-12 object-cover"
                  unoptimized={audiobook.coverUrl.startsWith("/api/")}
                />
              ) : (
                <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center bg-muted">
                  <span className="text-lg">📚</span>
                </div>
              )}
            </Link>

            {/* Title and chapter */}
            <div className="min-w-0 flex-1">
              <Link
                href={`/audiobooks/${audiobook.id}`}
                className="block text-sm font-medium hover:underline"
              >
                <Marquee speed={25} pauseDuration={2500} gap={50}>
                  {audiobook.title}
                </Marquee>
              </Link>
              {currentChapter && hasChapters && (
                <button
                  onClick={() => setIsChapterDrawerOpen(true)}
                  className="flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title={t("chapters")}
                >
                  <List className="h-3 w-3 shrink-0" />
                  <Marquee speed={20} pauseDuration={2000} gap={40} className="flex-1">
                    {currentChapter.title}
                  </Marquee>
                </button>
              )}
            </div>
          </div>

          {/* Controls - simplified on mobile, full on desktop */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Previous chapter - hidden on mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 sm:flex"
              onClick={prevChapter}
              disabled={isLoading}
              title={t("previousChapter")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Skip backward */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => seekRelative(-SKIP_BACKWARD_SECONDS)}
              disabled={isLoading}
              title={t("skipBackward", { seconds: SKIP_BACKWARD_SECONDS })}
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            {/* Play/Pause */}
            <Button
              variant="default"
              size="icon"
              className="h-9 w-9 sm:h-10 sm:w-10"
              onClick={isPlaying ? pause : resume}
              disabled={isLoading}
              title={isPlaying ? t("pause") : t("play")}
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4 sm:h-5 sm:w-5" />
              ) : (
                <Play className="h-4 w-4 sm:h-5 sm:w-5 pl-0.5" />
              )}
            </Button>

            {/* Skip forward */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => seekRelative(SKIP_FORWARD_SECONDS)}
              disabled={isLoading}
              title={t("skipForward", { seconds: SKIP_FORWARD_SECONDS })}
            >
              <SkipForward className="h-4 w-4" />
            </Button>

            {/* Next chapter - hidden on mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 sm:flex"
              onClick={nextChapter}
              disabled={isLoading}
              title={t("nextChapter")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Seek bar and time - desktop only */}
          <div className="hidden flex-1 items-center gap-2 md:flex">
            {/* Progress mode toggle */}
            {hasChapters && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={toggleProgressMode}
                title={isChapterMode ? t("bookMode") : t("chapterMode")}
              >
                {isChapterMode ? (
                  <List className="h-3.5 w-3.5" />
                ) : (
                  <BookOpen className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <span className="w-12 text-right text-xs text-muted-foreground">
              {formatTime(sliderPosition)}
            </span>
            <Slider
              value={[sliderPosition]}
              max={sliderMax || 1}
              step={1}
              onPointerDown={handleSeekStart}
              onValueChange={handleSeekPreview}
              onValueCommit={handleSeekCommit}
              className="flex-1"
              disabled={isLoading}
            />
            <span className="w-12 text-xs text-muted-foreground">
              {formatTime(sliderMax)}
            </span>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-1">
            {/* Playback speed - mobile (opens drawer) */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs font-medium sm:hidden"
              onClick={() => setIsSpeedDrawerOpen(true)}
              title={t("speed")}
            >
              {playbackRate}x
            </Button>

            {/* Playback speed - desktop (dropdown) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden h-8 px-2 text-xs font-medium sm:flex"
                  title={t("speed")}
                >
                  {playbackRate}x
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {PLAYBACK_RATES.map((rate) => (
                  <DropdownMenuItem
                    key={rate}
                    onClick={() => setPlaybackRate(rate)}
                    className={cn(rate === playbackRate && "bg-accent")}
                  >
                    {rate}x
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Volume - desktop only */}
            <div className="hidden items-center gap-1 lg:flex">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleMute}
                title={volume > 0 ? t("mute") : t("unmute")}
              >
                {volume > 0 ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </Button>
              <Slider
                value={[volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="w-20"
              />
            </div>

            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={stop}
              title={t("close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile progress bar with chapter nav - shown on small screens */}
        <div className="flex items-center gap-1.5 px-3 pb-2 sm:hidden">
          {/* Previous chapter */}
          {hasChapters && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={prevChapter}
              disabled={isLoading}
              title={t("previousChapter")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}

          {/* Progress mode toggle */}
          {hasChapters && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={toggleProgressMode}
              title={isChapterMode ? t("bookMode") : t("chapterMode")}
            >
              {isChapterMode ? (
                <List className="h-3.5 w-3.5" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
            {formatTime(sliderPosition)}
          </span>
          <Slider
            value={[sliderPosition]}
            max={sliderMax || 1}
            step={1}
            onPointerDown={handleSeekStart}
            onValueChange={handleSeekPreview}
            onValueCommit={handleSeekCommit}
            className="flex-1"
            disabled={isLoading}
          />
          <span className="w-9 text-[11px] tabular-nums text-muted-foreground">
            {formatTime(sliderMax)}
          </span>

          {/* Next chapter */}
          {hasChapters && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={nextChapter}
              disabled={isLoading}
              title={t("nextChapter")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        </motion.div>
      </AnimatePresence>

      {/* Chapter navigation drawer */}
      {audiobook.chapters && (
        <ChapterDrawer
          open={isChapterDrawerOpen}
          onOpenChange={setIsChapterDrawerOpen}
          chapters={audiobook.chapters}
          currentChapter={currentChapter}
          currentPosition={currentPosition}
          isPlaying={isPlaying}
          onSelectChapter={handleSelectChapter}
        />
      )}

      {/* Playback speed drawer (mobile) */}
      <SpeedDrawer
        open={isSpeedDrawerOpen}
        onOpenChange={setIsSpeedDrawerOpen}
        currentRate={playbackRate}
        onSelectRate={setPlaybackRate}
      />
    </>
  );
}
