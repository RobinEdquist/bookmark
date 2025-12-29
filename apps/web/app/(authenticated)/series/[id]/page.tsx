"use client";

import { use } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowLeft, Headphones, BookOpen, Clock, FileText } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useSeriesDetail } from "../../../../lib/use-series";
import { formatSeriesOrder } from "../../../../lib/format-series";

interface SeriesDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default function SeriesDetailPage({ params }: SeriesDetailPageProps) {
  const { id } = use(params);
  const t = useTranslations("series");
  const { data: series, isLoading, error } = useSeriesDetail(id);

  if (isLoading) {
    return (
      <div className="flex flex-col p-4 lg:p-8">
        <div className="mx-auto w-full max-w-6xl">
          {/* Back button skeleton */}
          <Skeleton className="mb-6 h-9 w-32" />
          {/* Title skeleton */}
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="mb-8 h-5 w-48" />
          {/* Grid skeleton */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">{t("detail.notFound")}</p>
        <Button asChild variant="link" className="mt-4">
          <Link href="/series">{t("detail.backToSeries")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 lg:p-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <Button asChild variant="ghost" size="sm" className="mb-4">
            <Link href="/series">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("detail.backToSeries")}
            </Link>
          </Button>
          <h1 className="text-2xl font-bold lg:text-3xl">{series.name}</h1>
          {series.description && (
            <p className="mt-2 text-muted-foreground">{series.description}</p>
          )}
          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
            {series.audiobookCount > 0 && (
              <span className="flex items-center gap-1">
                <Headphones className="h-4 w-4" />
                {t("detail.audiobookCount", { count: series.audiobookCount })}
              </span>
            )}
            {series.ebookCount > 0 && (
              <span className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                {t("detail.ebookCount", { count: series.ebookCount })}
              </span>
            )}
          </div>
        </div>

        {/* Audiobooks Section */}
        {series.audiobooks.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Headphones className="h-5 w-5" />
              {t("detail.audiobooksSection")}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6">
              {series.audiobooks.map((audiobook) => (
                <Link
                  key={audiobook.id}
                  href={`/audiobooks/${audiobook.id}`}
                  className="group block"
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl shadow-sm transition-all duration-200 ease-out group-hover:scale-105 group-hover:-translate-y-1 group-hover:shadow-lg">
                    {audiobook.coverUrl ? (
                      <Image
                        src={audiobook.coverUrl}
                        alt={audiobook.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                        unoptimized={audiobook.coverUrl.startsWith("/api/")}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-muted">
                        <Headphones className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                    {audiobook.status === "missing" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="rounded bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground">
                          {t("detail.missing")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className="line-clamp-2 text-sm font-medium group-hover:text-primary">
                      {audiobook.order && (
                        <span className="mr-1 text-muted-foreground">#{formatSeriesOrder(audiobook.order)}</span>
                      )}
                      {audiobook.title}
                    </p>
                    {audiobook.authors.length > 0 && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {audiobook.authors.map((a) => a.name).join(", ")}
                      </p>
                    )}
                    {audiobook.duration && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(audiobook.duration)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Ebooks Section */}
        {series.ebooks.length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="h-5 w-5" />
              {t("detail.ebooksSection")}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6">
              {series.ebooks.map((ebook) => (
                <Link
                  key={ebook.id}
                  href={`/ebooks/${ebook.id}`}
                  className="group block"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-sm transition-all duration-200 ease-out group-hover:scale-105 group-hover:-translate-y-1 group-hover:shadow-lg">
                    {ebook.coverUrl ? (
                      <Image
                        src={ebook.coverUrl}
                        alt={ebook.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                        unoptimized={ebook.coverUrl.startsWith("/api/")}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-muted">
                        <BookOpen className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                    {ebook.status === "missing" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="rounded bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground">
                          {t("detail.missing")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className="line-clamp-2 text-sm font-medium group-hover:text-primary">
                      {ebook.order && (
                        <span className="mr-1 text-muted-foreground">#{formatSeriesOrder(ebook.order)}</span>
                      )}
                      {ebook.title}
                    </p>
                    {ebook.authors.length > 0 && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {ebook.authors.map((a) => a.name).join(", ")}
                      </p>
                    )}
                    {ebook.pageCount && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {t("detail.pageCount", { count: ebook.pageCount })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {series.audiobooks.length === 0 && series.ebooks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">{t("detail.noBooks")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
