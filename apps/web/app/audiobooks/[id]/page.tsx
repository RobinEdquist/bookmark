"use client";

import { use, useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { ArrowLeft, Clock, Calendar, User, Mic, BookOpen, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { useAudiobook } from "../../../lib/use-audiobooks";
import { useMyPermissions } from "../../../lib/use-users";
import { EditAudiobookDialog } from "../../../components/audiobooks/edit-audiobook-dialog";

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

export default function AudiobookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("audiobooks.detail");
  const { data: audiobook, isLoading, error } = useAudiobook(id);
  const { data: permissions } = useMyPermissions();
  const [editOpen, setEditOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  const canEdit = permissions?.canEditMetadata ?? false;

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
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditOpen(true)}
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

            <Button size="lg" className="w-full">
              {t("play")}
            </Button>
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

            {/* Chapters */}
            {audiobook.chapters.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-2 font-semibold">
                  <BookOpen className="h-4 w-4" />
                  {t("chapters")} ({audiobook.chapters.length})
                </h3>
                <div className="rounded-lg border border-border/50">
                  {audiobook.chapters.map((chapter, index) => (
                    <div
                      key={chapter.id}
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
                    </div>
                  ))}
                </div>
              </div>
            )}
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
    </main>
  );
}
