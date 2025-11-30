"use client";

import { use, useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Clock, Calendar, User, Mic, BookOpen, Pencil, ChevronDown, ChevronUp, FileAudio, ImageIcon, Play, Pause } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/ui/accordion";
import { useAudiobook } from "../../../../lib/use-audiobooks";
import { useMyPermissions } from "../../../../lib/use-users";
import { useHardcoverStatus } from "../../../../lib/use-hardcover";
import { useProgress } from "../../../../lib/use-progress";
import { usePlayer } from "../../../../components/providers/player-provider";
import { EditAudiobookDialog } from "../../../../components/audiobooks/edit-audiobook-dialog";
import { HardcoverSyncDialog } from "../../../../components/audiobooks/hardcover-sync-dialog";
import { HardcoverLinkCard } from "../../../../components/audiobooks/hardcover-link-card";
import { ChangeCoverDialog } from "../../../../components/audiobooks/change-cover-dialog";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatChapterTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function AudiobookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("audiobooks.detail");
  const { data: audiobook, isLoading, error } = useAudiobook(id);
  const { data: progress } = useProgress(id);
  const { data: permissions } = useMyPermissions();
  const { isConfigured: isHardcoverConfigured } = useHardcoverStatus();
  const { audiobook: currentlyPlaying, isPlaying, play, pause, resume } = usePlayer();
  const [editOpen, setEditOpen] = useState(false);
  const [hardcoverSyncOpen, setHardcoverSyncOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState<string | undefined>(undefined);
  const [filesOpen, setFilesOpen] = useState<string | undefined>(undefined);
  const descriptionRef = useRef<HTMLDivElement>(null);

  const canEdit = permissions?.canEditMetadata ?? false;
  const isCurrentlyPlaying = currentlyPlaying?.id === id && isPlaying;
  const isThisAudiobookLoaded = currentlyPlaying?.id === id;

  const handlePlayPause = () => {
    if (!audiobook) return;

    if (isThisAudiobookLoaded) {
      // This audiobook is already loaded, toggle play/pause
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    } else {
      // Start playing this audiobook from saved progress or beginning
      const startPosition = progress?.position ?? 0;
      play(audiobook, startPosition);
    }
  };

  useEffect(() => {
    if (descriptionRef.current) {
      setDescriptionOverflows(descriptionRef.current.scrollHeight > 200);
    }
  }, [audiobook?.description]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </main>
    );
  }

  if (error || !audiobook) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{t("error")}</p>
        <Button variant="outline" asChild>
          <Link href="/libraries">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToLibrary")}
          </Link>
        </Button>
      </main>
    );
  }

  const authors = audiobook.authors.map((a) => a.name).join(", ");
  const narrators = audiobook.narrators.map((n) => n.name).join(", ");
  const primarySeries = audiobook.series[0];

  return (
    <main className="min-h-screen">
      {/* Header with back button */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/libraries">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex-1 truncate text-lg font-medium">{audiobook.title}</h1>
          {isHardcoverConfigured && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHardcoverSyncOpen(true)}
              title={t("syncWithHardcover")}
            >
              <Image
                src="/hardcover.svg"
                alt="Hardcover"
                width={20}
                height={20}
              />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChangeCoverOpen(true)}
              title={t("changeCover")}
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditOpen(true)}
              title={t("edit")}
            >
              <Pencil className="h-5 w-5" />
            </Button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <motion.div
          className="grid gap-8 lg:grid-cols-[300px_1fr]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Cover and Play Button */}
          <div className="flex flex-col gap-4">
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-border/50 shadow-xl">
              {audiobook.coverUrl ? (
                <Image
                  src={audiobook.coverUrl}
                  alt={audiobook.title}
                  fill
                  className="object-cover"
                  priority
                  unoptimized={audiobook.coverUrl.startsWith("/api/")}
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-muted">
                  <span className="text-6xl">📚</span>
                </div>
              )}
            </div>

            <Button size="lg" className="w-full" onClick={handlePlayPause}>
              {isCurrentlyPlaying ? (
                <>
                  <Pause className="mr-2 h-5 w-5" />
                  {t("pause")}
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" />
                  {progress && progress.position > 0 ? t("resume") : t("play")}
                </>
              )}
            </Button>

            {/* Genres and Tags */}
            {(audiobook.genres.length > 0 || audiobook.tags.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {audiobook.genres.map((genre) => (
                  <span
                    key={genre.id}
                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    {genre.name}
                  </span>
                ))}
                {audiobook.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Hardcover Link */}
            {isHardcoverConfigured && (
              <HardcoverLinkCard audiobookId={id} />
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            {/* Title and subtitle */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                {audiobook.title}
              </h2>
              {audiobook.subtitle && (
                <p className="mt-1 text-lg text-muted-foreground">
                  {audiobook.subtitle}
                </p>
              )}
              {primarySeries && (
                <p className="mt-2 text-sm text-primary">
                  {t("bookInSeries", {
                    order: primarySeries.order,
                    series: primarySeries.name,
                  })}
                </p>
              )}
            </div>

            {/* Metadata grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {authors && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("author")}</p>
                    <p className="font-medium">{authors}</p>
                  </div>
                </div>
              )}

              {narrators && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Mic className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("narrator")}</p>
                    <p className="font-medium">{narrators}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("duration")}</p>
                  <p className="font-medium">{formatDuration(audiobook.duration)}</p>
                </div>
              </div>

              {audiobook.publishedDate && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("published")}</p>
                    <p className="font-medium">
                      {new Date(audiobook.publishedDate).getFullYear()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            {audiobook.description && (
              <div>
                <h3 className="mb-2 font-semibold">{t("description")}</h3>
                <div className="relative">
                  <motion.div
                    ref={descriptionRef}
                    className="text-sm leading-relaxed text-muted-foreground [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-4 [&_blockquote]:italic [&_strong]:font-semibold [&_em]:italic overflow-hidden"
                    initial={false}
                    animate={{
                      height: descriptionExpanded
                        ? descriptionRef.current?.scrollHeight ?? "auto"
                        : descriptionOverflows
                          ? 200
                          : "auto",
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    dangerouslySetInnerHTML={{ __html: audiobook.description }}
                  />
                  <motion.div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent"
                    initial={false}
                    animate={{ opacity: descriptionOverflows && !descriptionExpanded ? 1 : 0 }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                {descriptionOverflows && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-auto px-0 py-1 text-primary hover:bg-transparent hover:text-primary/80"
                    onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                  >
                    {descriptionExpanded ? (
                      <>
                        {t("showLess")}
                        <ChevronUp className="ml-1 h-4 w-4" />
                      </>
                    ) : (
                      <>
                        {t("showMore")}
                        <ChevronDown className="ml-1 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Chapters */}
            <Accordion
              type="single"
              collapsible
              className="w-full"
              value={chaptersOpen}
              onValueChange={setChaptersOpen}
            >
              <AccordionItem value="chapters" className="border-b-0">
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex items-center gap-2 font-semibold">
                    <BookOpen className="h-4 w-4" />
                    {t("chapters")} ({audiobook.chapters.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {audiobook.chapters.length > 0 ? (
                    <div className="rounded-lg border border-border/50 mt-2 overflow-hidden">
                      <AnimatePresence mode="sync">
                        {chaptersOpen === "chapters" && audiobook.chapters.map((chapter, index) => {
                          // Calculate stagger delay - cap it to avoid too long delays for many chapters
                          const staggerDelay = Math.min(index * 0.03, 0.5);

                          return (
                            <motion.div
                              key={chapter.id}
                              initial={{ opacity: 0, x: -12 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -12 }}
                              transition={{
                                duration: 0.2,
                                delay: staggerDelay,
                                ease: [0.32, 0.72, 0, 1],
                              }}
                              className={`flex items-center justify-between px-4 py-3 ${
                                index !== audiobook.chapters.length - 1
                                  ? "border-b border-border/50"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">
                                  {index + 1}
                                </span>
                                <span className="text-sm">{chapter.title}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatChapterTime(chapter.startTime)}
                              </span>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">
                      {t("noChapters")}
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Files */}
            <Accordion
              type="single"
              collapsible
              className="w-full"
              value={filesOpen}
              onValueChange={setFilesOpen}
            >
              <AccordionItem value="files" className="border-b-0">
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex items-center gap-2 font-semibold">
                    <FileAudio className="h-4 w-4" />
                    {t("files")} ({audiobook.files.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {audiobook.files.length > 0 ? (
                    <div className="rounded-lg border border-border/50 mt-2 overflow-hidden">
                      <AnimatePresence mode="sync">
                        {filesOpen === "files" && audiobook.files.map((file, index) => {
                          const staggerDelay = Math.min(index * 0.03, 0.5);

                          return (
                            <motion.div
                              key={file.id}
                              initial={{ opacity: 0, x: -12 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -12 }}
                              transition={{
                                duration: 0.2,
                                delay: staggerDelay,
                                ease: [0.32, 0.72, 0, 1],
                              }}
                              className={`px-4 py-3 ${
                                index !== audiobook.files.length - 1
                                  ? "border-b border-border/50"
                                  : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium" title={file.filePath}>
                                    {file.fileName}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground" title={file.filePath}>
                                    {file.filePath}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-xs text-muted-foreground">
                                    {formatDuration(file.duration)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatFileSize(file.sizeBytes)}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                                <span>{file.format.toUpperCase()}</span>
                                {file.bitrate && <span>{Math.round(file.bitrate / 1000)} kbps</span>}
                                {file.sampleRate && <span>{(file.sampleRate / 1000).toFixed(1)} kHz</span>}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">
                      {t("noFiles")}
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </motion.div>
      </div>

      {canEdit && (
        <EditAudiobookDialog
          audiobook={audiobook}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {isHardcoverConfigured && (
        <HardcoverSyncDialog
          audiobookId={id}
          audiobookTitle={audiobook.title}
          open={hardcoverSyncOpen}
          onOpenChange={setHardcoverSyncOpen}
        />
      )}

      {canEdit && (
        <ChangeCoverDialog
          audiobookId={id}
          audiobookTitle={audiobook.title}
          currentCoverUrl={audiobook.coverUrl}
          open={changeCoverOpen}
          onOpenChange={setChangeCoverOpen}
        />
      )}
    </main>
  );
}
