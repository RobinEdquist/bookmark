"use client";

import { useCallback } from "react";
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
import { usePlayer } from "../providers/player-provider";

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
    seekRelative,
    setPlaybackRate,
    setVolume,
    nextChapter,
    prevChapter,
  } = usePlayer();

  const handleSeek = useCallback(
    (value: number[]) => {
      const position = value[0];
      if (position !== undefined) {
        seek(position);
      }
    },
    [seek]
  );

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
    <AnimatePresence>
      <motion.div
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

        <div className="flex h-16 items-center gap-4 px-4 lg:px-6">
          {/* Book info - left side */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
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
                  className="h-12 w-12 object-cover"
                  unoptimized={audiobook.coverUrl.startsWith("/api/")}
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center bg-muted">
                  <span className="text-lg">📚</span>
                </div>
              )}
            </Link>

            {/* Title and chapter */}
            <div className="min-w-0 flex-1">
              <Link
                href={`/audiobooks/${audiobook.id}`}
                className="block truncate text-sm font-medium hover:underline"
              >
                {audiobook.title}
              </Link>
              {currentChapter && (
                <p className="truncate text-xs text-muted-foreground">
                  {currentChapter.title}
                </p>
              )}
            </div>
          </div>

          {/* Controls - center */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Previous chapter */}
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
              className="h-10 w-10"
              onClick={isPlaying ? pause : resume}
              disabled={isLoading}
              title={isPlaying ? t("pause") : t("play")}
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 pl-0.5" />
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

            {/* Next chapter */}
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
            <span className="w-12 text-right text-xs text-muted-foreground">
              {formatTime(currentPosition)}
            </span>
            <Slider
              value={[currentPosition]}
              max={duration || 1}
              step={1}
              onValueChange={handleSeek}
              className="flex-1"
              disabled={isLoading}
            />
            <span className="w-12 text-xs text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-1">
            {/* Playback speed */}
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

        {/* Mobile progress bar with time - shown on small screens */}
        <div className="flex items-center gap-2 px-4 pb-3 md:hidden">
          <span className="w-10 text-right text-xs text-muted-foreground">
            {formatTime(currentPosition)}
          </span>
          <Slider
            value={[currentPosition]}
            max={duration || 1}
            step={1}
            onValueChange={handleSeek}
            className="flex-1"
            disabled={isLoading}
          />
          <span className="w-10 text-xs text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
