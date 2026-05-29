"use client";

import { use, useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import DOMPurify from "dompurify";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Calendar, User, Mic, BookOpen, Pencil, ChevronDown, ChevronUp, FileAudio, ImageIcon, Play, Pause, CheckCircle2, Download, RotateCcw } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
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
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";
import { useAudiobook } from "../../../../lib/use-audiobooks";
import { useMyPermissions } from "../../../../lib/use-users";
import { useHardcoverStatus } from "../../../../lib/use-hardcover";
import { useGrFinderStatus } from "../../../../lib/use-goodreads";
import { useProgress, useResetProgress } from "../../../../lib/use-progress";
import { useLibraryReturnUrl } from "../../../../lib/use-library-return-url";
import { useLibraryNavigation } from "../../../../lib/use-library-navigation";
import { usePlayer } from "../../../../components/providers/player-provider";
import { EditAudiobookDialog } from "../../../../components/audiobooks/edit-audiobook-dialog";
import { HardcoverSyncDialog } from "../../../../components/hardcover/hardcover-sync-dialog";
import { HardcoverLinkCard } from "../../../../components/hardcover/hardcover-link-card";
import { GoodreadsSearchDialog } from "../../../../components/goodreads/goodreads-search-dialog";
import { GoodreadsLinkCard } from "../../../../components/goodreads/goodreads-link-card";
import { ChangeCoverDialog } from "../../../../components/audiobooks/change-cover-dialog";
import { HeaderSearch } from "../../../../components/layout/header-search";
import { RemovableChip } from "../../../../components/common/removable-chip";
import { useQuickAddMetadata } from "../../../../lib/use-quick-add-metadata";
import { useTheme } from "../../../../lib/use-theme";
import { ChapterImportDialog } from "../../../../components/chapters/chapter-import-dialog";

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
  const { isDark } = useTheme();
  const returnUrl = useLibraryReturnUrl("/audiobooks");
  const { previousId, nextId } = useLibraryNavigation("/audiobooks", id);
  const { data: audiobook, isLoading, error } = useAudiobook(id);
  const { data: progress } = useProgress(id);
  const { data: permissions } = useMyPermissions();
  const { isConfigured: isHardcoverConfigured } = useHardcoverStatus();
  const { isConfigured: isGrFinderConfigured } = useGrFinderStatus();
  const { audiobook: currentlyPlaying, isPlaying, play, pause, resume } = usePlayer();
  const [editOpen, setEditOpen] = useState(false);
  const [hardcoverSyncOpen, setHardcoverSyncOpen] = useState(false);
  const [goodreadsSearchOpen, setGoodreadsSearchOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const [chapterImportOpen, setChapterImportOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState<string | undefined>(undefined);
  const [filesOpen, setFilesOpen] = useState<string | undefined>(undefined);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const sanitizedDescription = useMemo(
    () => (audiobook?.description ? DOMPurify.sanitize(audiobook.description) : ""),
    [audiobook?.description],
  );

  const canEdit = permissions?.canEditMetadata ?? false;
  const { removeGenre, removeTag, isPending: isMetadataPending } = useQuickAddMetadata("audiobook", id);
  const resetProgressMutation = useResetProgress();
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

  const handleResetProgress = () => {
    resetProgressMutation.mutate(id, {
      onSuccess: () => {
        toast.success(t("progress.resetSuccess"));
      },
      onError: () => {
        toast.error(t("progress.resetError"));
      },
    });
  };

  const handleDownload = () => {
    window.open(`/api/audiobooks/${id}/download`, "_blank");
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
          <Link href="/audiobooks">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToLibrary")}
          </Link>
        </Button>
      </main>
    );
  }

  const authors = audiobook.authors.map((a) => a.name).join(", ");
  const narrators = audiobook.narrators.map((n) => n.name).join(", ");

  return (
    <main className="min-h-screen">
      {/* Header with back button */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={returnUrl}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          {(previousId || nextId) && (
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                asChild={!!previousId}
                disabled={!previousId}
                title={t("previous")}
              >
                {previousId ? (
                  <Link href={`/audiobooks/${previousId}`}>
                    <ChevronLeft className="h-5 w-5" />
                  </Link>
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                asChild={!!nextId}
                disabled={!nextId}
                title={t("next")}
              >
                {nextId ? (
                  <Link href={`/audiobooks/${nextId}`}>
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </Button>
            </div>
          )}
          <HeaderSearch mediaType="audiobook" />
          <div className="flex-1" />
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
          {isGrFinderConfigured && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setGoodreadsSearchOpen(true)}
              title={t("searchOnGoodreads")}
            >
              <Image
                src="/goodreads.svg"
                alt="Goodreads"
                width={20}
                height={20}
                className={isDark ? "invert" : ""}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            title={t("download")}
          >
            <Download className="h-5 w-5" />
          </Button>
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

            {/* Progress indicator */}
            {progress && progress.position > 0 && audiobook.duration && (
              <div
                className="space-y-1.5"
                title={t("progress.timeOf", {
                  current: formatDuration(progress.position),
                  total: formatDuration(audiobook.duration),
                })}
              >
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.round((progress.position / audiobook.duration) * 100))}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  {progress.completed ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>{t("progress.completed")}</span>
                    </>
                  ) : (
                    <span>
                      {t("progress.percentage", {
                        percentage: Math.round((progress.position / audiobook.duration) * 100),
                      })}
                    </span>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t("progress.reset")}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("progress.resetConfirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("progress.resetConfirmDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("progress.resetCancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleResetProgress}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("progress.resetConfirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {/* Genres and Tags */}
            {(audiobook.genres.length > 0 || audiobook.tags.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {audiobook.genres.map((genre) => (
                  <RemovableChip
                    key={genre.id}
                    value={genre.name}
                    variant="genre"
                    onRemove={removeGenre}
                    canEdit={canEdit}
                    isPending={isMetadataPending}
                  />
                ))}
                {audiobook.tags.map((tag) => (
                  <RemovableChip
                    key={tag.id}
                    value={tag.name}
                    variant="tag"
                    onRemove={removeTag}
                    canEdit={canEdit}
                    isPending={isMetadataPending}
                  />
                ))}
              </div>
            )}

            {/* Goodreads Link */}
            {isGrFinderConfigured && (
              <GoodreadsLinkCard mediaType="audiobook" mediaId={id} />
            )}

            {/* Hardcover Link */}
            {isHardcoverConfigured && (
              <HardcoverLinkCard mediaType="audiobook" mediaId={id} />
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

              {audiobook.series.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("series")}</p>
                    <p className="font-medium">
                      {audiobook.series.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && ", "}
                          <Link
                            href={`/series/${s.id}`}
                            className="hover:underline"
                          >
                            {s.name}
                          </Link>
                          {s.order && ` #${parseFloat(s.order)}`}
                        </span>
                      ))}
                    </p>
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
                  <div
                    ref={descriptionRef}
                    className="text-sm leading-relaxed text-muted-foreground [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-4 [&_blockquote]:italic [&_strong]:font-semibold [&_em]:italic overflow-hidden transition-[max-height] duration-300 ease-in-out"
                    style={{
                      maxHeight: descriptionExpanded
                        ? descriptionRef.current?.scrollHeight ?? 9999
                        : 200,
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                  />
                  <div
                    className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent transition-opacity duration-200 ${
                      descriptionOverflows && !descriptionExpanded ? "opacity-100" : "opacity-0"
                    }`}
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
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setChapterImportOpen(true)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t("importChapters")}
                    </Button>
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
          mediaType="audiobook"
          mediaId={id}
          mediaTitle={audiobook.title}
          open={hardcoverSyncOpen}
          onOpenChange={setHardcoverSyncOpen}
        />
      )}

      {isGrFinderConfigured && (
        <GoodreadsSearchDialog
          mediaType="audiobook"
          mediaId={id}
          mediaTitle={audiobook.title}
          open={goodreadsSearchOpen}
          onOpenChange={setGoodreadsSearchOpen}
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

      {canEdit && (
        <ChapterImportDialog
          audiobookId={id}
          audiobookTitle={audiobook.title}
          audiobookAuthor={authors}
          currentChapters={audiobook.chapters}
          open={chapterImportOpen}
          onOpenChange={setChapterImportOpen}
        />
      )}
    </main>
  );
}
