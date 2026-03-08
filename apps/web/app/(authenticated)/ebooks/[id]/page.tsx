"use client";

import { use, useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar, User, BookOpen, Library, Pencil, ChevronDown, ChevronUp, FileText, ImageIcon, Download, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
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
import { useEbook } from "../../../../lib/use-ebooks";
import { useEbookProgress, useResetEbookProgress } from "../../../../lib/use-ebook-progress";
import { useMyPermissions } from "../../../../lib/use-users";
import { useHardcoverStatus } from "../../../../lib/use-hardcover";
import { useGrFinderStatus } from "../../../../lib/use-goodreads";
import { useLibraryReturnUrl } from "../../../../lib/use-library-return-url";
import { useLibraryNavigation } from "../../../../lib/use-library-navigation";
import { EditEbookDialog } from "../../../../components/ebooks/edit-ebook-dialog";
import { ChangeEbookCoverDialog } from "../../../../components/ebooks/change-ebook-cover-dialog";
import { ReadButton } from "../../../../components/ebooks/read-button";
import { HardcoverSyncDialog } from "../../../../components/hardcover/hardcover-sync-dialog";
import { HardcoverLinkCard } from "../../../../components/hardcover/hardcover-link-card";
import { GoodreadsSearchDialog } from "../../../../components/goodreads/goodreads-search-dialog";
import { GoodreadsLinkCard } from "../../../../components/goodreads/goodreads-link-card";
import { HeaderSearch } from "../../../../components/layout/header-search";
import { RemovableChip } from "../../../../components/common/removable-chip";
import { useQuickAddMetadata } from "../../../../lib/use-quick-add-metadata";
import { useTheme } from "../../../../lib/use-theme";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function EbookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("ebooks.detail");
  const { isDark } = useTheme();
  const returnUrl = useLibraryReturnUrl("/ebooks");
  const { previousId, nextId } = useLibraryNavigation("/ebooks", id);
  const { data: ebook, isLoading, error } = useEbook(id);
  const { data: ebookProgress } = useEbookProgress(id);
  const { data: permissions } = useMyPermissions();
  const resetProgressMutation = useResetEbookProgress();
  const { isConfigured: isHardcoverConfigured } = useHardcoverStatus();
  const { isConfigured: isGrFinderConfigured } = useGrFinderStatus();
  const [editOpen, setEditOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const [hardcoverSyncOpen, setHardcoverSyncOpen] = useState(false);
  const [goodreadsSearchOpen, setGoodreadsSearchOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  const canEdit = permissions?.canEditMetadata ?? false;
  const { removeGenre, removeTag, isPending: isMetadataPending } = useQuickAddMetadata("ebook", id);

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
    window.open(`/api/ebooks/${id}/download`, "_blank");
  };

  useEffect(() => {
    if (descriptionRef.current) {
      setDescriptionOverflows(descriptionRef.current.scrollHeight > 200);
    }
  }, [ebook?.description]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </main>
    );
  }

  if (error || !ebook) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{t("error")}</p>
        <Button variant="outline" asChild>
          <Link href="/ebooks">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToLibrary")}
          </Link>
        </Button>
      </main>
    );
  }

  const authors = ebook.authors.map((a) => a.name).join(", ");

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
                  <Link href={`/ebooks/${previousId}`}>
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
                  <Link href={`/ebooks/${nextId}`}>
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </Button>
            </div>
          )}
          <HeaderSearch mediaType="ebook" />
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
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <motion.div
          className="grid gap-8 lg:grid-cols-[280px_1fr]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Cover and Download Button */}
          <div className="flex flex-col gap-4">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border/50 shadow-xl">
              {ebook.coverUrl ? (
                <Image
                  src={ebook.coverUrl}
                  alt={ebook.title}
                  fill
                  className="object-cover"
                  priority
                  unoptimized={ebook.coverUrl.startsWith("/api/")}
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-muted">
                  <span className="text-6xl">📖</span>
                </div>
              )}
            </div>

            <ReadButton
              ebookId={id}
              ebookTitle={ebook.title}
              format={ebook.format}
            />

            <Button size="lg" className="w-full" variant="outline" onClick={handleDownload}>
              <Download className="mr-2 h-5 w-5" />
              {t("download")}
            </Button>

            {/* Progress indicator */}
            {ebookProgress && ebookProgress.progressPercent > 0 && (
              <div className="space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.min(100, ebookProgress.progressPercent)}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  {ebookProgress.completed ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>{t("progress.completed")}</span>
                    </>
                  ) : (
                    <span>
                      {t("progress.percentage", {
                        percentage: ebookProgress.progressPercent,
                      })}
                    </span>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer w-full"
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
            {(ebook.genres.length > 0 || ebook.tags.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {ebook.genres.map((genre) => (
                  <RemovableChip
                    key={genre.id}
                    value={genre.name}
                    variant="genre"
                    onRemove={removeGenre}
                    canEdit={canEdit}
                    isPending={isMetadataPending}
                  />
                ))}
                {ebook.tags.map((tag) => (
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
              <GoodreadsLinkCard mediaType="ebook" mediaId={id} />
            )}

            {/* Hardcover Link */}
            {isHardcoverConfigured && (
              <HardcoverLinkCard mediaType="ebook" mediaId={id} />
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            {/* Title and subtitle */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                {ebook.title}
              </h2>
              {ebook.subtitle && (
                <p className="mt-1 text-lg text-muted-foreground">
                  {ebook.subtitle}
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

              {ebook.series.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Library className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("series")}</p>
                    <p className="font-medium">
                      {ebook.series.map((s, i) => (
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

              {ebook.pageCount && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("pages")}</p>
                    <p className="font-medium">{ebook.pageCount}</p>
                  </div>
                </div>
              )}

              {ebook.publishedDate && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("published")}</p>
                    <p className="font-medium">
                      {new Date(ebook.publishedDate).getFullYear()}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("fileInfo")}</p>
                  <p className="font-medium">
                    {ebook.format.toUpperCase()} • {formatFileSize(ebook.sizeBytes)}
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            {ebook.description && (
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
                    dangerouslySetInnerHTML={{ __html: ebook.description }}
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

            {/* Additional metadata */}
            {(ebook.publisher || ebook.isbn || ebook.language) && (
              <div className="rounded-lg border border-border/50 p-4">
                <h3 className="mb-3 font-semibold">{t("additionalInfo")}</h3>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {ebook.publisher && (
                    <>
                      <dt className="text-muted-foreground">{t("publisher")}</dt>
                      <dd>{ebook.publisher}</dd>
                    </>
                  )}
                  {ebook.isbn && (
                    <>
                      <dt className="text-muted-foreground">{t("isbn")}</dt>
                      <dd className="font-mono">{ebook.isbn}</dd>
                    </>
                  )}
                  {ebook.language && (
                    <>
                      <dt className="text-muted-foreground">{t("language")}</dt>
                      <dd>{ebook.language}</dd>
                    </>
                  )}
                </dl>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {canEdit && (
        <EditEbookDialog
          ebook={ebook}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {canEdit && (
        <ChangeEbookCoverDialog
          ebookId={id}
          ebookTitle={ebook.title}
          currentCoverUrl={ebook.coverUrl}
          open={changeCoverOpen}
          onOpenChange={setChangeCoverOpen}
        />
      )}

      {isHardcoverConfigured && (
        <HardcoverSyncDialog
          mediaType="ebook"
          mediaId={id}
          mediaTitle={ebook.title}
          open={hardcoverSyncOpen}
          onOpenChange={setHardcoverSyncOpen}
        />
      )}

      {isGrFinderConfigured && (
        <GoodreadsSearchDialog
          mediaType="ebook"
          mediaId={id}
          mediaTitle={ebook.title}
          initialQuery={`${ebook.title} ${authors}`}
          open={goodreadsSearchOpen}
          onOpenChange={setGoodreadsSearchOpen}
        />
      )}
    </main>
  );
}
