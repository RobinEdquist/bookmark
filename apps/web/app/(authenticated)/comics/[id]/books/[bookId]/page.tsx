"use client";

import { use, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  Pencil,
  ImageIcon,
  Download,
  Trash2,
  BookOpen,
  CalendarDays,
  FileArchive,
  HardDrive,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";

import { useComicBook } from "../../../../../../lib/use-comics";
import { safeHttpUrl } from "../../../../../../lib/safe-url";
import { useMyPermissions } from "../../../../../../lib/use-users";
import { useComicvineStatus } from "../../../../../../lib/use-comicvine";
import { ComicvineMatchDialog } from "../../../../../../components/comicvine/comicvine-match-dialog";
import { ComicvineLinkCard } from "../../../../../../components/comicvine/comicvine-link-card";
import { formatFileSize } from "../../../../../../lib/format-file-size";
import { formatDesignation } from "../../../../../../components/comics/comic-book-list";
import { EditComicBookDialog } from "../../../../../../components/comics/edit-comic-book-dialog";
import { ChangeComicBookCoverDialog } from "../../../../../../components/comics/change-comic-book-cover-dialog";
import { DeleteComicBookDialog } from "../../../../../../components/comics/delete-comic-book-dialog";
import type { ComicCreatorRole } from "../../../../../../lib/use-comics";

export default function ComicBookDetailPage({
  params,
}: {
  params: Promise<{ id: string; bookId: string }>;
}) {
  const { id, bookId } = use(params);
  const t = useTranslations("comics");
  const tcv = useTranslations("comicvine.matchDialog");
  const tRole = useTranslations("comics.role");
  const router = useRouter();

  const { data, isLoading, error } = useComicBook(bookId);
  const { data: permissions } = useMyPermissions();

  const [editOpen, setEditOpen] = useState(false);
  const [changeCoverOpen, setChangeCoverOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [comicvineMatchOpen, setComicvineMatchOpen] = useState(false);

  const canEdit = permissions?.canEditMetadata ?? false;
  const canDelete = permissions?.canDelete ?? false;
  const isAdmin = permissions?.isAdmin ?? false;
  const { isConfigured: isComicvineConfigured } = useComicvineStatus(isAdmin);

  const seriesId = data?.series.id ?? id;

  // Sanitize summary if it contains HTML
  const sanitizedSummary = useMemo(() => {
    if (!data?.summary) return "";
    return DOMPurify.sanitize(data.summary);
  }, [data?.summary]);

  // Group creators by role, preserving order within each role
  const creatorsByRole = useMemo(() => {
    if (!data?.creators || data.creators.length === 0) {
      return new Map<ComicCreatorRole, string[]>();
    }
    const map = new Map<ComicCreatorRole, string[]>();
    // Sort by order first so grouping respects intended sequence
    const sorted = [...data.creators].sort((a, b) => a.order - b.order);
    for (const creator of sorted) {
      const existing = map.get(creator.role) ?? [];
      existing.push(creator.name);
      map.set(creator.role, existing);
    }
    return map;
  }, [data?.creators]);

  const handleDownload = () => {
    window.open(`/api/comics/books/${bookId}/download`, "_blank");
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{t("detail.error")}</p>
        <Button variant="outline" asChild>
          <Link href={`/comics/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("detail.back")}
          </Link>
        </Button>
      </main>
    );
  }

  const designation = formatDesignation(data, t);
  const safeWeb = safeHttpUrl(data.web);

  return (
    <main className="min-h-screen">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/comics/${seriesId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>

          <div className="flex-1" />

          {isAdmin && isComicvineConfigured && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setComicvineMatchOpen(true)}
              title={tcv("openAction")}
            >
              <Sparkles className="h-5 w-5" />
            </Button>
          )}

          {/* Download */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            title={t("book.download")}
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
              onClick={() => setDeleteOpen(true)}
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
              {data.coverUrl ? (
                <Image
                  src={data.coverUrl}
                  alt={designation}
                  fill
                  className="object-cover"
                  priority
                  unoptimized={data.coverUrl.startsWith("/api/")}
                  sizes="(max-width: 1024px) 100vw, 280px"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-muted">
                  <span
                    className="text-6xl text-muted-foreground"
                    aria-hidden="true"
                  >
                    📖
                  </span>
                </div>
              )}
            </div>

            {/* Download button below cover */}
            <Button
              size="lg"
              className="w-full"
              variant="outline"
              onClick={handleDownload}
            >
              <Download className="mr-2 h-5 w-5" />
              {t("book.download")}
            </Button>
          </div>

          {/* Details column */}
          <div className="space-y-6">
            {/* Heading: format-aware designation */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                {designation}
              </h2>
              {/* Optional title (story title) */}
              {data.title && (
                <p className="mt-1 text-xl text-muted-foreground">
                  {data.title}
                </p>
              )}
              {/* Series link */}
              <p className="mt-2 text-sm text-muted-foreground">
                <Link
                  href={`/comics/${seriesId}`}
                  className="hover:text-foreground hover:underline"
                >
                  {data.series.title}
                </Link>
              </p>
            </div>

            {/* File info grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {data.container && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <FileArchive className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("book.container")}
                    </p>
                    <p className="font-medium uppercase">{data.container}</p>
                  </div>
                </div>
              )}

              {data.pageCount != null && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("book.pageCount")}
                    </p>
                    <p className="font-medium">
                      {t("book.pages", { count: data.pageCount })}
                    </p>
                  </div>
                </div>
              )}

              {data.sizeBytes > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <HardDrive className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("book.fileSize")}
                    </p>
                    <p className="font-medium">{formatFileSize(data.sizeBytes)}</p>
                  </div>
                </div>
              )}

              {data.coverDate && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("book.coverDate")}
                    </p>
                    <p className="font-medium">{data.coverDate}</p>
                  </div>
                </div>
              )}

              {data.storeDate && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("book.storeDate")}
                    </p>
                    <p className="font-medium">{data.storeDate}</p>
                  </div>
                </div>
              )}

              {data.collects && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Layers className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("detail.collectsLabel")}
                    </p>
                    <p className="font-medium">{data.collects}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Age rating + web link */}
            {(data.ageRating || safeWeb) && (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {data.ageRating && (
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {t("book.ageRating")}:
                    </span>{" "}
                    {data.ageRating}
                  </span>
                )}
                {safeWeb && (
                  <a
                    href={safeWeb}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t("book.web")}
                  </a>
                )}
              </div>
            )}

            {/* Creators grouped by role */}
            {creatorsByRole.size > 0 && (
              <div className="rounded-lg border border-border/50 p-4">
                <h3 className="mb-3 font-semibold">{t("detail.creators")}</h3>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {Array.from(creatorsByRole.entries()).map(([role, names]) => (
                    <div key={role} style={{ display: "contents" }}>
                      <dt className="text-muted-foreground">
                        {tRole(role as ComicCreatorRole)}
                      </dt>
                      <dd>{names.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Metadata tag chips: Story Arcs, Characters, Teams, Locations */}
            {data.metadataTags && (
              <>
                {data.metadataTags.storyArcs.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                      {t("book.storyArcs")}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {data.metadataTags.storyArcs.map((arc) => (
                        <Link
                          key={arc}
                          href={`/comics?metadataTag=${encodeURIComponent(`story_arc:${arc}`)}`}
                          className="inline-flex items-center rounded-full border border-border/50 bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                        >
                          {arc}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {data.metadataTags.characters.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                      {t("book.characters")}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {data.metadataTags.characters.map((char) => (
                        <Link
                          key={char}
                          href={`/comics?metadataTag=${encodeURIComponent(`character:${char}`)}`}
                          className="inline-flex items-center rounded-full border border-border/50 bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                        >
                          {char}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {data.metadataTags.teams.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                      {t("book.teams")}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {data.metadataTags.teams.map((team) => (
                        <Link
                          key={team}
                          href={`/comics?metadataTag=${encodeURIComponent(`team:${team}`)}`}
                          className="inline-flex items-center rounded-full border border-border/50 bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                        >
                          {team}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {data.metadataTags.locations.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                      {t("book.locations")}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {data.metadataTags.locations.map((loc) => (
                        <Link
                          key={loc}
                          href={`/comics?metadataTag=${encodeURIComponent(`location:${loc}`)}`}
                          className="inline-flex items-center rounded-full border border-border/50 bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                        >
                          {loc}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Summary */}
            {data.summary && (
              <div>
                <h3 className="mb-2 font-semibold">{t("book.summary")}</h3>
                {sanitizedSummary !== data.summary ? (
                  // Contains HTML — render sanitized
                  <div
                    className="text-sm leading-relaxed text-muted-foreground [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-4 [&_blockquote]:italic [&_em]:italic [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4"
                    dangerouslySetInnerHTML={{ __html: sanitizedSummary }}
                  />
                ) : (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {data.summary}
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {isAdmin && isComicvineConfigured && (
          <div className="mt-8">
            <ComicvineLinkCard level="book" entityId={bookId} />
          </div>
        )}
      </div>

      {/* Book dialogs */}
      {canEdit && (
        <EditComicBookDialog
          bookId={bookId}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {canEdit && (
        <ChangeComicBookCoverDialog
          bookId={bookId}
          bookTitle={designation}
          currentCoverUrl={data.coverUrl}
          open={changeCoverOpen}
          onOpenChange={setChangeCoverOpen}
        />
      )}

      {canDelete && (
        <DeleteComicBookDialog
          bookId={bookId}
          bookTitle={designation}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => router.push(`/comics/${seriesId}`)}
        />
      )}

      {isAdmin && isComicvineConfigured && (
        <ComicvineMatchDialog
          level="book"
          entityId={bookId}
          entityTitle={data.title ?? designation}
          open={comicvineMatchOpen}
          onOpenChange={setComicvineMatchOpen}
        />
      )}
    </main>
  );
}
