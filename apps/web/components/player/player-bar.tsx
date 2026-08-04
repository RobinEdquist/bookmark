"use client";

import {
  useCallback,
  useState,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
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
  Moon,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Slider } from "@repo/ui/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { cn } from "@repo/ui/lib/utils";
import { Marquee } from "@repo/ui/components/ui/marquee";
import { usePlayer } from "../providers/player-provider";
import { GeneratedCover } from "../common/generated-cover";
import { ChapterDrawer } from "./chapter-drawer";
import { SpeedDrawer } from "./speed-drawer";
import { SleepTimerDrawer } from "./sleep-timer-drawer";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SKIP_BACKWARD_SECONDS = 15;
const SKIP_FORWARD_SECONDS = 30;

// Keyboard steps for the global progress bar
const PROGRESS_ARROW_STEP_SECONDS = 10;
const PROGRESS_PAGE_STEP_SECONDS = 60;

/**
 * Visible hint for the player's icon-only controls. Mirrors the trigger's
 * aria-label so the text stays in one place per control.
 */
function ControlTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

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
    sleepTimer,
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
    startSleepTimer,
    cancelSleepTimer,
  } = usePlayer();

  // Drawer states
  const [isChapterDrawerOpen, setIsChapterDrawerOpen] = useState(false);
  const [isSpeedDrawerOpen, setIsSpeedDrawerOpen] = useState(false);
  const [isSleepTimerDrawerOpen, setIsSleepTimerDrawerOpen] = useState(false);

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

  // Sleep timer handlers
  const handleSelectSleepDuration = useCallback((minutes: number) => {
    startSleepTimer("duration", minutes);
  }, [startSleepTimer]);

  const handleSelectEndOfChapter = useCallback(() => {
    startSleepTimer("endOfChapter");
  }, [startSleepTimer]);

  // Format sleep timer remaining time for button display
  const formatSleepTimerDisplay = useCallback((): string | null => {
    if (!sleepTimer.active) return null;
    if (sleepTimer.type === "endOfChapter") return t("chapter");
    if (sleepTimer.remainingSeconds === null) return null;

    const seconds = sleepTimer.remainingSeconds;
    if (seconds >= 60) {
      return `${Math.ceil(seconds / 60)}m`;
    }
    return `${seconds}s`;
  }, [sleepTimer, t]);

  const sleepTimerDisplay = formatSleepTimerDisplay();

  const progress = duration > 0 ? (currentPosition / duration) * 100 : 0;

  // --- Global progress bar: click or drag anywhere on it to seek the book ---
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isSeekDisabled = isLoading || duration <= 0;

  // Maps a pointer x-coordinate onto an absolute position in the book
  const positionFromClientX = useCallback(
    (clientX: number): number | null => {
      const rect = progressBarRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || duration <= 0) return null;
      const ratio = (clientX - rect.left) / rect.width;
      return Math.min(Math.max(ratio, 0), 1) * duration;
    },
    [duration]
  );

  const handleProgressPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isSeekDisabled) return;
      const position = positionFromClientX(event.clientX);
      if (position === null) return;

      // Capture the pointer so a drag keeps tracking outside the 4px bar
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsScrubbing(true);
      seekStart();
      seekPreview(position);
    },
    [isSeekDisabled, positionFromClientX, seekPreview, seekStart]
  );

  const handleProgressPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Pointer capture is the source of truth here, not React state, so the
      // first move after pointerdown isn't dropped waiting on a re-render
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const position = positionFromClientX(event.clientX);
      if (position !== null) seekPreview(position);
    },
    [positionFromClientX, seekPreview]
  );

  const handleProgressPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setIsScrubbing(false);
      seekEnd(); // Re-enable timeupdate before committing
      const position = positionFromClientX(event.clientX);
      if (position !== null) seek(position);
    },
    [positionFromClientX, seek, seekEnd]
  );

  // Safety net: if a drag is interrupted (window loses focus, pointer released
  // off-screen), clear the seeking flag so timeupdate can move the bar again
  const handleProgressLostCapture = useCallback(() => {
    setIsScrubbing(false);
    seekEnd();
  }, [seekEnd]);

  const handleProgressKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (isSeekDisabled) return;

      let next: number;
      switch (event.key) {
        case "ArrowLeft":
          next = currentPosition - PROGRESS_ARROW_STEP_SECONDS;
          break;
        case "ArrowRight":
          next = currentPosition + PROGRESS_ARROW_STEP_SECONDS;
          break;
        case "PageDown":
          next = currentPosition - PROGRESS_PAGE_STEP_SECONDS;
          break;
        case "PageUp":
          next = currentPosition + PROGRESS_PAGE_STEP_SECONDS;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = duration;
          break;
        default:
          return;
      }

      event.preventDefault();
      seek(Math.min(Math.max(next, 0), duration));
    },
    [currentPosition, duration, isSeekDisabled, seek]
  );

  // Don't render if no audiobook is loaded
  if (!audiobook) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
      <AnimatePresence>
        <motion.div
          key="player-bar"
          role="region"
          aria-label={t("playerRegion")}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 overflow-hidden"
        >
        {/* Global book progress at top - click or drag anywhere to seek */}
        <div
          ref={progressBarRef}
          role="slider"
          tabIndex={isSeekDisabled ? -1 : 0}
          aria-label={t("bookSeek")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentPosition)}
          aria-valuetext={t("currentTime", {
            current: formatTime(currentPosition),
            total: formatTime(duration),
          })}
          aria-disabled={isSeekDisabled || undefined}
          onPointerDown={handleProgressPointerDown}
          onPointerMove={handleProgressPointerMove}
          onPointerUp={handleProgressPointerUp}
          onPointerCancel={handleProgressPointerUp}
          onLostPointerCapture={handleProgressLostCapture}
          onKeyDown={handleProgressKeyDown}
          className={cn(
            "group relative z-10 h-1 w-full touch-none",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
            isSeekDisabled ? "cursor-default" : "cursor-pointer"
          )}
        >
          {/* Invisible grab area - makes the 4px bar comfortable to hit without
              changing the player's layout height. Kept at 6px: the 48px cover
              art below leaves only 8px of dead space at the sm+ breakpoint, so
              a taller band would start swallowing clicks on the cover link. */}
          <span className="absolute inset-x-0 -bottom-1.5 top-0" aria-hidden="true" />

          {/* Track grows on hover/scrub as a scrub affordance. Absolutely
              positioned so the growth never shifts the controls below. */}
          <span
            className={cn(
              "absolute inset-x-0 top-0 h-1 overflow-hidden bg-muted transition-[height] duration-150 motion-reduce:transition-none",
              !isSeekDisabled && "group-hover:h-2 group-focus-visible:h-2",
              isScrubbing && "h-2"
            )}
          >
            <span
              className={cn(
                "block h-full bg-primary",
                // No width transition while scrubbing - the fill must track the
                // pointer instantly rather than easing behind it
                !isScrubbing &&
                  "transition-[width] duration-150 motion-reduce:transition-none"
              )}
              style={{ width: `${progress}%` }}
            />
          </span>
        </div>

        <div className="flex h-16 items-center gap-2 px-3 sm:gap-4 sm:px-4 lg:px-6">
          {/* Book info - left side */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {/* Cover */}
            <Link
              href={`/audiobooks/${audiobook.id}`}
              className="shrink-0 overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t("viewAudiobook", { title: audiobook.title })}
            >
              {audiobook.coverUrl ? (
                <Image
                  src={audiobook.coverUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="h-10 w-10 sm:h-12 sm:w-12 object-cover"
                  unoptimized={audiobook.coverUrl.startsWith("/api/")}
                />
              ) : (
                <GeneratedCover
                  title={audiobook.title}
                  className="h-10 w-10 sm:h-12 sm:w-12"
                  aria-hidden
                />
              )}
            </Link>

            {/* Title and chapter */}
            <div className="min-w-0 flex-1">
              <Link
                href={`/audiobooks/${audiobook.id}`}
                className="block text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              >
                <Marquee speed={25} pauseDuration={2500} gap={50}>
                  {audiobook.title}
                </Marquee>
              </Link>
              {currentChapter && hasChapters && (
                <ControlTooltip label={t("openChapterList")}>
                  <button
                    type="button"
                    onClick={() => setIsChapterDrawerOpen(true)}
                    className="flex max-w-full cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm transition-colors"
                    aria-label={t("openChapterList")}
                    aria-haspopup="dialog"
                  >
                    <List className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <Marquee speed={20} pauseDuration={2000} gap={40} className="flex-1">
                      {currentChapter.title}
                    </Marquee>
                  </button>
                </ControlTooltip>
              )}
            </div>
          </div>

          {/* Controls - simplified on mobile, full on desktop */}
          <div className="flex items-center gap-1 sm:gap-2" role="group" aria-label={t("playbackControls")}>
            {/* Previous chapter - hidden on mobile */}
            <ControlTooltip label={t("previousChapter")}>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-8 w-8 sm:flex"
                onClick={prevChapter}
                disabled={isLoading}
                aria-label={t("previousChapter")}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            </ControlTooltip>

            {/* Skip backward */}
            <ControlTooltip
              label={t("skipBackward", { seconds: SKIP_BACKWARD_SECONDS })}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => seekRelative(-SKIP_BACKWARD_SECONDS)}
                disabled={isLoading}
                aria-label={t("skipBackward", { seconds: SKIP_BACKWARD_SECONDS })}
              >
                <SkipBack className="h-4 w-4" aria-hidden="true" />
              </Button>
            </ControlTooltip>

            {/* Play/Pause */}
            <ControlTooltip label={isPlaying ? t("pause") : t("play")}>
              <Button
                variant="default"
                size="icon"
                className="mx-3 h-9 w-9 sm:mx-2 sm:h-10 sm:w-10"
                onClick={isPlaying ? pause : resume}
                disabled={isLoading}
                aria-label={isPlaying ? t("pause") : t("play")}
              >
                {isLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" role="status" aria-label={t("loading")} />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4 sm:h-5 sm:w-5 pl-0.5" aria-hidden="true" />
                )}
              </Button>
            </ControlTooltip>

            {/* Skip forward */}
            <ControlTooltip
              label={t("skipForward", { seconds: SKIP_FORWARD_SECONDS })}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => seekRelative(SKIP_FORWARD_SECONDS)}
                disabled={isLoading}
                aria-label={t("skipForward", { seconds: SKIP_FORWARD_SECONDS })}
              >
                <SkipForward className="h-4 w-4" aria-hidden="true" />
              </Button>
            </ControlTooltip>

            {/* Next chapter - hidden on mobile */}
            <ControlTooltip label={t("nextChapter")}>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-8 w-8 sm:flex"
                onClick={nextChapter}
                disabled={isLoading}
                aria-label={t("nextChapter")}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </ControlTooltip>
          </div>

          {/* Seek bar and time - desktop only */}
          <div className="hidden flex-1 items-center gap-2 md:flex">
            {/* Progress mode toggle */}
            {hasChapters && (
              <ControlTooltip
                label={isChapterMode ? t("bookMode") : t("chapterMode")}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={toggleProgressMode}
                  aria-label={isChapterMode ? t("bookMode") : t("chapterMode")}
                >
                  {isChapterMode ? (
                    <List className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Button>
              </ControlTooltip>
            )}
            <span className="w-12 text-right text-xs text-muted-foreground" aria-hidden="true">
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
              aria-label={isChapterMode ? t("chapterSeek") : t("bookSeek")}
              aria-valuetext={t("currentTime", { current: formatTime(sliderPosition), total: formatTime(sliderMax) })}
            />
            <span className="w-12 text-xs text-muted-foreground" aria-hidden="true">
              {formatTime(sliderMax)}
            </span>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-1">
            {/* Sleep timer button - desktop only */}
            <ControlTooltip
              label={sleepTimer.active ? t("sleepTimerActive") : t("sleepTimer")}
            >
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "hidden h-8 w-8 relative sm:flex",
                  sleepTimer.active && "text-primary"
                )}
                onClick={() => setIsSleepTimerDrawerOpen(true)}
                aria-label={sleepTimer.active ? t("sleepTimerActive") : t("sleepTimer")}
                aria-haspopup="dialog"
              >
                <Moon className="h-4 w-4" aria-hidden="true" />
                {sleepTimerDisplay && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-medium tabular-nums">
                    {sleepTimerDisplay}
                  </span>
                )}
              </Button>
            </ControlTooltip>

            {/* Playback speed - desktop (dropdown) */}
            <DropdownMenu>
              <ControlTooltip label={t("speedValue", { rate: playbackRate })}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden h-8 px-2 text-xs font-medium sm:flex"
                    aria-label={t("speedValue", { rate: playbackRate })}
                  >
                    {playbackRate}x
                  </Button>
                </DropdownMenuTrigger>
              </ControlTooltip>
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
            <div className="hidden items-center gap-1 lg:flex" role="group" aria-label={t("volumeControls")}>
              <ControlTooltip label={volume > 0 ? t("mute") : t("unmute")}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={toggleMute}
                  aria-label={volume > 0 ? t("mute") : t("unmute")}
                  aria-pressed={volume === 0}
                >
                  {volume > 0 ? (
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <VolumeX className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </ControlTooltip>
              <Slider
                value={[volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="w-20"
                aria-label={t("volume")}
                aria-valuetext={`${Math.round(volume * 100)}%`}
              />
            </div>

            {/* Close button */}
            <ControlTooltip label={t("close")}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={stop}
                aria-label={t("close")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </ControlTooltip>
          </div>
        </div>

        {/* Mobile progress bar with chapter nav - shown on small screens */}
        <div className="flex items-center gap-1.5 px-3 pb-1 sm:hidden">
          {/* Previous chapter */}
          {hasChapters && (
            <ControlTooltip label={t("previousChapter")}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={prevChapter}
                disabled={isLoading}
                aria-label={t("previousChapter")}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            </ControlTooltip>
          )}

          {/* Progress mode toggle */}
          {hasChapters && (
            <ControlTooltip
              label={isChapterMode ? t("bookMode") : t("chapterMode")}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={toggleProgressMode}
                aria-label={isChapterMode ? t("bookMode") : t("chapterMode")}
              >
                {isChapterMode ? (
                  <List className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </Button>
            </ControlTooltip>
          )}

          <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
            {formatTime(sliderPosition)}
          </span>
          <Slider
            value={[sliderPosition]}
            max={sliderMax || 1}
            step={1}
            onPointerDown={handleSeekStart}
            onValueChange={handleSeekPreview}
            onValueCommit={handleSeekCommit}
            className="min-w-0 flex-1"
            disabled={isLoading}
            aria-label={isChapterMode ? t("chapterSeek") : t("bookSeek")}
            aria-valuetext={t("currentTime", { current: formatTime(sliderPosition), total: formatTime(sliderMax) })}
          />
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
            {formatTime(sliderMax)}
          </span>

          {/* Next chapter */}
          {hasChapters && (
            <ControlTooltip label={t("nextChapter")}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={nextChapter}
                disabled={isLoading}
                aria-label={t("nextChapter")}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </ControlTooltip>
          )}
        </div>

        {/* Mobile extra controls row - sleep timer and speed */}
        <div className="flex items-center justify-center gap-4 px-3 pb-2 sm:hidden">
          {/* Sleep timer - mobile */}
          <ControlTooltip
            label={sleepTimer.active ? t("sleepTimerActive") : t("sleepTimer")}
          >
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1.5 px-3",
                sleepTimer.active && "text-primary"
              )}
              onClick={() => setIsSleepTimerDrawerOpen(true)}
              aria-label={sleepTimer.active ? t("sleepTimerActive") : t("sleepTimer")}
              aria-haspopup="dialog"
            >
              <Moon className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-medium">
                {sleepTimerDisplay || t("sleepTimer")}
              </span>
            </Button>
          </ControlTooltip>

          {/* Playback speed - mobile */}
          <ControlTooltip label={t("speedValue", { rate: playbackRate })}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-3"
              onClick={() => setIsSpeedDrawerOpen(true)}
              aria-label={t("speedValue", { rate: playbackRate })}
              aria-haspopup="dialog"
            >
              <span className="text-xs font-medium">{playbackRate}x {t("speed")}</span>
            </Button>
          </ControlTooltip>
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

      {/* Sleep timer drawer */}
      <SleepTimerDrawer
        open={isSleepTimerDrawerOpen}
        onOpenChange={setIsSleepTimerDrawerOpen}
        isActive={sleepTimer.active}
        activeType={sleepTimer.type}
        remainingSeconds={sleepTimer.remainingSeconds}
        hasChapters={hasChapters}
        onSelectDuration={handleSelectSleepDuration}
        onSelectEndOfChapter={handleSelectEndOfChapter}
        onCancel={cancelSleepTimer}
      />
    </TooltipProvider>
  );
}
