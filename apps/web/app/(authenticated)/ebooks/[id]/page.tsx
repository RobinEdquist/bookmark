"use client";

import { use, useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { ArrowLeft, Calendar, User, BookOpen, Pencil, ChevronDown, ChevronUp, FileText, ImageIcon, Download } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { useEbook } from "../../../../lib/use-ebooks";
import { useMyPermissions } from "../../../../lib/use-users";
import { useHardcoverStatus } from "../../../../lib/use-hardcover";
import { EditEbookDialog } from "../../../../components/ebooks/edit-ebook-dialog";
import { ChangeEbookCoverDialog } from "../../../../components/ebooks/change-ebook-cover-dialog";
import { HardcoverSyncDialog } from "../../../../components/hardcover/hardcover-sync-dialog";
import { HardcoverLinkCard } from "../../../../components/hardcover/hardcover-link-card";

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
  const { data: ebook, isLoading, error } = useEbook(id);
  const { data: permissions } = useMyPermissions();
  const { isConfigured: isHardcoverConfigured } = useHardcoverStatus();
  const [editOpen, setEditOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const [hardcoverSyncOpen, setHardcoverSyncOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  const canEdit = permissions?.canEditMetadata ?? false;

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
  const primarySeries = ebook.series[0];

  return (
    <main className="min-h-screen">
      {/* Header with back button */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/ebooks">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex-1 truncate text-lg font-medium">{ebook.title}</h1>
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
          className="grid gap-8 lg:grid-cols-[240px_1fr]"
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

            <Button size="lg" className="w-full" onClick={handleDownload}>
              <Download className="mr-2 h-5 w-5" />
              {t("download")}
            </Button>

            {/* Genres and Tags */}
            {(ebook.genres.length > 0 || ebook.tags.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {ebook.genres.map((genre) => (
                  <span
                    key={genre.id}
                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    {genre.name}
                  </span>
                ))}
                {ebook.tags.map((tag) => (
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
    </main>
  );
}
