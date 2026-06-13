"use client";

import { use, useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Globe,
  Building2,
  BookImage,
  ShieldAlert,
  Pencil,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Download,
  Trash2,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { Badge } from "@repo/ui/components/ui/badge";
import { useComicSeriesDetail } from "../../../../lib/use-comics";
import { useMyPermissions } from "../../../../lib/use-users";
import { useLibraryReturnUrl } from "../../../../lib/use-library-return-url";
import { useLibraryNavigation } from "../../../../lib/use-library-navigation";
import { EditComicSeriesDialog } from "../../../../components/comics/edit-comic-series-dialog";
import { ChangeComicSeriesCoverDialog } from "../../../../components/comics/change-comic-series-cover-dialog";
import { DeleteComicSeriesDialog } from "../../../../components/comics/delete-comic-series-dialog";
import { ComicBookList } from "../../../../components/comics/comic-book-list";
import type { ComicCreatorRole } from "../../../../lib/use-comics";

export default function ComicSeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("comics");
  const router = useRouter();
  const returnUrl = useLibraryReturnUrl("/comics");
  const { previousId, nextId } = useLibraryNavigation("/comics", id);
  const { data: series, isLoading, error } = useComicSeriesDetail(id);
  const { data: permissions } = useMyPermissions();

  const [editOpen, setEditOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  // Track whether the delete dialog was ever opened; if the query then errors, navigate back
  const deleteOpenedRef = useRef(false);

  const canEdit = permissions?.canEditMetadata ?? false;
  const canDelete = permissions?.canDelete ?? false;

  const sanitizedDescription = useMemo(
    () =>
      series?.description ? DOMPurify.sanitize(series.description) : "",
    [series?.description],
  );

  useEffect(() => {
    if (descriptionRef.current) {
      setDescriptionOverflows(descriptionRef.current.scrollHeight > 200);
    }
  }, [series?.description]);

  // Group creators by role for the aggregated creators block
  const creatorsByRole = useMemo(() => {
    if (!series?.creators || series.creators.length === 0) {
      return new Map<ComicCreatorRole, string[]>();
    }
    const map = new Map<ComicCreatorRole, string[]>();
    for (const creator of series.creators) {
      const existing = map.get(creator.role) ?? [];
      existing.push(creator.name);
      map.set(creator.role, existing);
    }
    return map;
  }, [series?.creators]);

  // Navigate back to comics list if the series disappears after a delete attempt
  useEffect(() => {
    if (deleteOpenedRef.current && error) {
      router.push("/comics");
    }
  }, [error, router]);

  const handleDownloadSeries = () => {
    window.open(`/api/comics/series/${id}/download`, "_blank");
  };

  const handleDeleteOpenChange = (open: boolean) => {
    if (open) {
      deleteOpenedRef.current = true;
    }
    setDeleteOpen(open);
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </main>
    );
  }

  if (error || !series) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{t("detail.error")}</p>
        <Button variant="outline" asChild>
          <Link href="/comics">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("detail.back")}
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Sticky header with back + prev/next navigation */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={returnUrl}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          {(previousId ?? nextId) && (
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                asChild={!!previousId}
                disabled={!previousId}
                title={t("detail.previous")}
              >
                {previousId ? (
                  <Link href={`/comics/${previousId}`}>
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
                title={t("detail.next")}
              >
                {nextId ? (
                  <Link href={`/comics/${nextId}`}>
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </Button>
            </div>
          )}
          <div className="flex-1" />
          {/* Download all */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownloadSeries}
            title={t("detail.downloadSeries")}
          >
            <Download className="h-5 w-5" />
          </Button>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChangeCoverOpen(true)}
              title={t("detail.changeCover")}
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditOpen(true)}
              title={t("detail.edit")}
            >
              <Pencil className="h-5 w-5" />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteOpenChange(true)}
              title={t("detail.delete")}
            >
              <Trash2 className="h-5 w-5" />
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
          {/* Cover column */}
          <div className="flex flex-col gap-4">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border/50 shadow-xl">
              {series.coverUrl ? (
                <Image
                  src={series.coverUrl}
                  alt={series.title}
                  fill
                  className="object-cover"
                  priority
                  unoptimized={series.coverUrl.startsWith("/api/")}
                  sizes="(max-width: 1024px) 100vw, 280px"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-muted">
                  <span className="text-6xl">💥</span>
                </div>
              )}
            </div>

            {/* Download all button below cover */}
            <Button
              size="lg"
              className="w-full"
              variant="outline"
              onClick={handleDownloadSeries}
            >
              <Download className="mr-2 h-5 w-5" />
              {t("detail.downloadSeries")}
            </Button>

            {/* Genres chips */}
            {series.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {series.genres.map((genre) => (
                  <Badge key={genre.id} variant="secondary">
                    {genre.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Details column */}
          <div className="space-y-6">
            {/* Title */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                {series.title}
              </h2>
            </div>

            {/* Metadata grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {series.startYear != null && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("detail.year")}
                    </p>
                    <p className="font-medium">{series.startYear}</p>
                  </div>
                </div>
              )}

              {series.publisher && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("detail.publisher")}
                    </p>
                    <p className="font-medium">
                      {series.publisher}
                      {series.imprint && (
                        <span className="text-muted-foreground">
                          {" / "}
                          {series.imprint}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {series.language && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("detail.language")}
                    </p>
                    <p className="font-medium">{series.language}</p>
                  </div>
                </div>
              )}

              {series.ageRating && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("detail.ageRating")}
                    </p>
                    <p className="font-medium">{series.ageRating}</p>
                  </div>
                </div>
              )}

              {series.books.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <BookImage className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("detail.books")}
                    </p>
                    <p className="font-medium">
                      {series.books.length}
                      {series.totalIssueCount != null &&
                        ` / ${series.totalIssueCount}`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Aggregated creators block — grouped by role */}
            {creatorsByRole.size > 0 && (
              <div className="rounded-lg border border-border/50 p-4">
                <h3 className="mb-3 font-semibold">{t("detail.creators")}</h3>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {Array.from(creatorsByRole.entries()).map(([role, names]) => (
                    <div key={role} style={{ display: "contents" }}>
                      <dt className="text-muted-foreground">
                        {t(`role.${role}`)}
                      </dt>
                      <dd>{names.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Description — expandable, sanitized HTML (mirrors ebook detail) */}
            {series.description && (
              <div>
                <h3 className="mb-2 font-semibold">
                  {t("detail.description")}
                </h3>
                <div className="relative">
                  <div
                    ref={descriptionRef}
                    className="overflow-hidden text-sm leading-relaxed text-muted-foreground transition-[max-height] duration-300 ease-in-out [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-4 [&_blockquote]:italic [&_em]:italic [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4"
                    style={{
                      maxHeight: descriptionExpanded
                        ? (descriptionRef.current?.scrollHeight ?? 9999)
                        : 200,
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                  />
                  <div
                    className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent transition-opacity duration-200 ${
                      descriptionOverflows && !descriptionExpanded
                        ? "opacity-100"
                        : "opacity-0"
                    }`}
                  />
                </div>
                {descriptionOverflows && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-auto px-0 py-1 text-primary hover:bg-transparent hover:text-primary/80"
                    onClick={() =>
                      setDescriptionExpanded(!descriptionExpanded)
                    }
                  >
                    {descriptionExpanded ? (
                      <>
                        {t("detail.showLess")}
                        <ChevronUp className="ml-1 h-4 w-4" />
                      </>
                    ) : (
                      <>
                        {t("detail.showMore")}
                        <ChevronDown className="ml-1 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Book list — book-level edit/cover/delete dialogs wired in Task 9 */}
        <div className="mt-10">
          <ComicBookList books={series.books} seriesId={id} />
        </div>
      </div>

      {/* Series-level dialogs */}
      {canEdit && (
        <EditComicSeriesDialog
          series={series}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {canEdit && (
        <ChangeComicSeriesCoverDialog
          seriesId={id}
          seriesTitle={series.title}
          currentCoverUrl={series.coverUrl}
          open={changeCoverOpen}
          onOpenChange={setChangeCoverOpen}
        />
      )}

      {canDelete && (
        <DeleteComicSeriesDialog
          seriesId={id}
          seriesTitle={series.title}
          open={deleteOpen}
          onOpenChange={handleDeleteOpenChange}
        />
      )}
    </main>
  );
}
