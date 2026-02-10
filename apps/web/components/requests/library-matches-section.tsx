"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Headphones, BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import type { LibrarySearchItem } from "../../lib/use-requests";

interface LibraryMatchesSectionProps {
  audiobooks: LibrarySearchItem[];
  ebooks: LibrarySearchItem[];
  isLoading: boolean;
  contentType: "all" | "audiobooks" | "ebooks";
}

function ScrollableRow({
  items,
  type,
  label,
}: {
  items: LibrarySearchItem[];
  type: "audiobook" | "ebook";
  label: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (items.length === 0) return null;

  const Icon = type === "audiobook" ? Headphones : BookOpen;
  const linkPrefix = type === "audiobook" ? "/audiobooks" : "/ebooks";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">
          {label} ({items.length})
        </h4>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
      >
        {items.map((item) => (
          <Link
            key={item.id}
            href={`${linkPrefix}/${item.id}`}
            className="group flex-shrink-0"
          >
            <div className="w-28 space-y-1.5">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                {item.coverUrl ? (
                  <Image
                    src={item.coverUrl}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="112px"
                    unoptimized={item.coverUrl.startsWith("/api/")}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div
                  className={cn(
                    "absolute right-1 top-1 rounded-full p-1",
                    type === "audiobook" ? "bg-orange-500" : "bg-blue-500"
                  )}
                >
                  <Icon className="h-3 w-3 text-white" />
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="line-clamp-2 text-xs font-medium leading-tight group-hover:text-primary">
                  {item.title}
                </p>
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {item.authors.map((a) => a.name).join(", ") || "Unknown"}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-28 space-y-1.5">
            <Skeleton className="aspect-square w-full rounded-md" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LibraryMatchesSection({
  audiobooks,
  ebooks,
  isLoading,
  contentType,
}: LibraryMatchesSectionProps) {
  const t = useTranslations("requests");

  const hasAudiobooks = audiobooks.length > 0;
  const hasEbooks = ebooks.length > 0;
  const hasResults = hasAudiobooks || hasEbooks;

  if (!isLoading && !hasResults) {
    return null;
  }

  return (
    <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-green-700 dark:text-green-400">
        {t("libraryMatches.title")}
      </h3>

      {isLoading ? (
        <div className="space-y-4">
          {(contentType === "all" || contentType === "audiobooks") && (
            <SkeletonRow />
          )}
          {(contentType === "all" || contentType === "ebooks") && (
            <SkeletonRow />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {(contentType === "all" || contentType === "audiobooks") && (
            <ScrollableRow
              items={audiobooks}
              type="audiobook"
              label={t("libraryMatches.audiobooks")}
            />
          )}
          {(contentType === "all" || contentType === "ebooks") && (
            <ScrollableRow
              items={ebooks}
              type="ebook"
              label={t("libraryMatches.ebooks")}
            />
          )}
        </div>
      )}
    </div>
  );
}
