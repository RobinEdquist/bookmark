"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Headphones, Play, Pause, MoreVertical, EyeOff, Settings, Clock, Star } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAllProgress, useHideProgress, type ProgressWithAudiobook } from "../../lib/use-progress";
import { useAudiobook } from "../../lib/use-audiobooks";
import { useLibraryAvailability } from "../../lib/use-library-availability";
import { useMyPermissions } from "../../lib/use-users";
import { usePlayer } from "../providers/player-provider";
import { HorizontalScrollRow } from "./horizontal-scroll-row";

function ContinueListeningCard({ progress }: { progress: ProgressWithAudiobook }) {
  const t = useTranslations("home.continueListening");
  const { audiobook: playerAudiobook, isPlaying, play, pause, resume } = usePlayer();
  const { data: audiobookDetail } = useAudiobook(progress.audiobook.id);
  const { mutate: hideProgress, isPending: isHiding } = useHideProgress();

  const isThisPlaying = playerAudiobook?.id === progress.audiobook.id && isPlaying;
  const isThisLoaded = playerAudiobook?.id === progress.audiobook.id;

  const percentage = progress.audiobook.duration
    ? Math.round((progress.position / progress.audiobook.duration) * 100)
    : 0;

  const handlePlayClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isThisLoaded) {
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    } else if (audiobookDetail) {
      play(audiobookDetail, progress.position);
    }
  };

  const handleHide = () => {
    hideProgress(progress.audiobook.id, {
      onSuccess: () => {
        toast.success(t("hideSuccess"));
      },
      onError: () => {
        toast.error(t("hideError"));
      },
    });
  };

  return (
    <div className="w-40 shrink-0 group/card">
      <motion.div
        className="space-y-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Cover with progress bar and play button */}
        <Link href={`/audiobooks/${progress.audiobook.id}`} prefetch={false} className="block">
          <div className="relative aspect-square overflow-hidden rounded-xl border border-border/50 bg-muted">
            <Image
              src={`/api/audiobooks/${progress.audiobook.id}/cover`}
              alt={progress.audiobook.title}
              fill
              className="object-cover transition-transform duration-300 group-hover/card:scale-105"
              unoptimized
              onError={(e) => {
                // Hide broken image and show fallback
                e.currentTarget.style.display = 'none';
              }}
            />
            {/* Fallback shown behind image or when image fails */}
            <div className="absolute inset-0 flex h-full items-center justify-center -z-10">
              <span className="text-4xl">📚</span>
            </div>

            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/card:bg-black/30">
              <Button
                size="icon"
                variant="secondary"
                className="h-12 w-12 rounded-full opacity-0 shadow-lg transition-opacity group-hover/card:opacity-100"
                onClick={handlePlayClick}
              >
                {isThisPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
              </Button>
            </div>

            {/* Progress bar at bottom */}
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </Link>

        {/* Title and menu */}
        <div className="flex items-start gap-1">
          <Link href={`/audiobooks/${progress.audiobook.id}`} prefetch={false} className="min-w-0 flex-1">
            <div className="space-y-0.5 px-0.5">
              {/* Rating - Goodreads takes priority over Hardcover */}
              {audiobookDetail?.goodreads?.rating !== null && audiobookDetail?.goodreads?.rating !== undefined ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Image
                    src="/goodreads.svg"
                    alt="Goodreads"
                    width={12}
                    height={12}
                    className="opacity-70"
                  />
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  <span>{audiobookDetail.goodreads.rating.toFixed(2)}</span>
                  <span>({audiobookDetail.goodreads.ratingsCount?.toLocaleString() ?? 0})</span>
                </div>
              ) : audiobookDetail?.hardcover?.rating !== null && audiobookDetail?.hardcover?.rating !== undefined ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Image
                    src="/hardcover.svg"
                    alt="Hardcover"
                    width={12}
                    height={12}
                    className="opacity-70"
                  />
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  <span>{audiobookDetail.hardcover.rating.toFixed(2)}</span>
                  <span>({audiobookDetail.hardcover.ratingsCount?.toLocaleString() ?? 0})</span>
                </div>
              ) : null}

              <h3 className="truncate text-sm font-medium leading-tight">
                {progress.audiobook.title}
              </h3>
              {audiobookDetail?.authors[0]?.name && (
                <p className="truncate text-xs text-muted-foreground">
                  {audiobookDetail.authors[0].name}
                </p>
              )}
            </div>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleHide} disabled={isHiding}>
                <EyeOff className="h-4 w-4" />
                {isHiding ? t("hiding") : t("hide")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>
    </div>
  );
}

export function ContinueListeningSection() {
  const t = useTranslations("home.continueListening");
  const { data: allProgress, isLoading } = useAllProgress();
  const { data: availability, isLoading: isLoadingAvailability } = useLibraryAvailability();
  const { data: permissions, isLoading: isLoadingPermissions } = useMyPermissions();

  // Filter to only show incomplete audiobooks, sorted by most recently updated
  const inProgressAudiobooks = useMemo(() => {
    if (!allProgress) return [];
    return allProgress
      .filter((p) => !p.completed && p.position > 0)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [allProgress]);

  if (isLoading || isLoadingAvailability || isLoadingPermissions) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="flex gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-40 shrink-0">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Check if audiobook library is configured
  const audiobookLibraryConfigured = availability?.audiobooks ?? false;
  const isAdmin = permissions?.isAdmin ?? false;

  // Show different empty states based on library configuration and user role
  if (!audiobookLibraryConfigured) {
    // No audiobook library configured
    if (isAdmin) {
      // Admin: prompt to configure library
      return (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>

          <motion.div
            className="flex flex-col items-center justify-center rounded-xl border bg-card p-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-4 rounded-full bg-primary/10 p-4">
              <Settings className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium">{t("noLibraryAdmin")}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {t("noLibraryAdminDescription")}
            </p>
            <Button asChild className="mt-6">
              <Link href="/settings">{t("goToSettings")}</Link>
            </Button>
          </motion.div>
        </section>
      );
    } else {
      // Regular user: show waiting message
      return (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>

          <motion.div
            className="flex flex-col items-center justify-center rounded-xl border bg-card p-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-4 rounded-full bg-muted p-4">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">{t("noLibraryUser")}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {t("noLibraryUserDescription")}
            </p>
          </motion.div>
        </section>
      );
    }
  }

  // Show empty state when library is configured but no in-progress audiobooks
  if (inProgressAudiobooks.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>

        <motion.div
          className="flex flex-col items-center justify-center rounded-xl border bg-card p-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-4 rounded-full bg-primary/10 p-4">
            <Headphones className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-medium">{t("emptyTitle")}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
          <Button asChild className="mt-6">
            <Link href="/audiobooks">{t("browseLibrary")}</Link>
          </Button>
        </motion.div>
      </section>
    );
  }

  return (
    <HorizontalScrollRow title={t("title")}>
      {inProgressAudiobooks.map((progress) => (
        <ContinueListeningCard key={progress.audiobookId} progress={progress} />
      ))}
    </HorizontalScrollRow>
  );
}
