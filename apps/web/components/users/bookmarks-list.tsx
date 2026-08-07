"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bookmark } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

import { useBookmarkedAudiobooks } from "../../lib/use-bookmarks";

const PAGE_SIZE = 20;

interface BookmarksListProps {
  userId: string;
}

/**
 * The audiobooks a user has bookmarks in, one row per book with a count,
 * ordered by most recent bookmark activity. Listing books instead of
 * individual bookmarks keeps this section bounded no matter how heavily the
 * user annotates — the bookmarks themselves live on the audiobook detail
 * page each row links to.
 */
export function BookmarksList({ userId }: BookmarksListProps) {
  const t = useTranslations("userProfile.bookmarks");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useBookmarkedAudiobooks(
    userId,
    offset,
    PAGE_SIZE,
  );

  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((book) => {
              const latestDate = new Date(
                book.latestBookmarkAt,
              ).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <Link
                  key={book.audiobookId}
                  href={`/audiobooks/${book.audiobookId}`}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
                >
                  {/* Cover */}
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                    {book.coverUrl && (
                      <Image
                        src={book.coverUrl}
                        alt={book.audiobookTitle}
                        fill
                        className="object-cover"
                        sizes="40px"
                        unoptimized
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <div className="absolute inset-0 flex h-full w-full items-center justify-center -z-10 text-muted-foreground">
                      <Bookmark className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {book.audiobookTitle}
                    </p>
                    {book.authorName && (
                      <p className="truncate text-xs text-muted-foreground">
                        {book.authorName}
                      </p>
                    )}
                  </div>

                  {/* Count & latest activity */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium tabular-nums">
                      {t("bookmarkCount", { count: book.bookmarkCount })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {latestDate}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {t("showing", {
                count: Math.min(offset + PAGE_SIZE, total),
                total,
              })}
            </span>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  {t("previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  {t("next")}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
