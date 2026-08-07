"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bookmark } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

import {
  useBookmarkedAudiobooks,
  type BookmarkedAudiobook,
} from "../../lib/use-bookmarks";

const PREVIEW_COUNT = 5;
const PAGE_SIZE = 20;

interface BookmarksListProps {
  userId: string;
}

/**
 * Profile-page section: the 5 most recently bookmarked audiobooks, one row
 * per book with a count. Even the per-book list can grow large for heavy
 * annotators, so the section stays capped and everything else lives on the
 * dedicated /users/:id/bookmarks page behind "See all".
 */
export function BookmarksList({ userId }: BookmarksListProps) {
  const t = useTranslations("userProfile.bookmarks");

  const { data, isLoading } = useBookmarkedAudiobooks(userId, 0, PREVIEW_COUNT);
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {total > PREVIEW_COUNT && (
          <Link
            href={`/users/${userId}/bookmarks`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t("seeAll", { total })} →
          </Link>
        )}
      </div>

      {isLoading ? (
        <BookmarkRowsSkeleton />
      ) : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {data.items.map((book) => (
            <BookmarkedAudiobookRow key={book.audiobookId} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The complete bookmarked-audiobooks list, paginated. Rendered by the
 * /users/:id/bookmarks page.
 */
export function AllBookmarksList({ userId }: BookmarksListProps) {
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

  if (isLoading) {
    return <BookmarkRowsSkeleton />;
  }

  if (!data || data.items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {data.items.map((book) => (
          <BookmarkedAudiobookRow key={book.audiobookId} book={book} />
        ))}
      </div>

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
    </div>
  );
}

function BookmarkedAudiobookRow({ book }: { book: BookmarkedAudiobook }) {
  const t = useTranslations("userProfile.bookmarks");

  const latestDate = new Date(book.latestBookmarkAt).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" },
  );

  return (
    <Link
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
        <p className="truncate text-sm font-medium">{book.audiobookTitle}</p>
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
        <p className="text-xs text-muted-foreground">{latestDate}</p>
      </div>
    </Link>
  );
}

function BookmarkRowsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-lg" />
      ))}
    </div>
  );
}
