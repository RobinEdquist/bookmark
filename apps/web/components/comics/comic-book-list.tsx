"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MoreVertical, Pencil, Trash2, ImageIcon, Download, Eye, AlertTriangle } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import type { ComicBookListItem, ComicBookFormat } from "../../lib/use-comics";
import { formatFileSize } from "../../lib/format-file-size";

// -----------------------------------------------------------------------
// formatDesignation — EXPORTED so Task 9 book detail page can import it
// -----------------------------------------------------------------------
export function formatDesignation(
  book: Pick<ComicBookListItem, "format" | "number">,
  t: ReturnType<typeof useTranslations<"comics">>
): string {
  const num = book.number;
  const format: ComicBookFormat = book.format;

  switch (format) {
    case "single_issue":
      return num != null ? t("book.issue", { number: num }) : t("book.untitled");
    case "tpb":
      return num != null ? t("book.volume", { number: num }) : t("format.tpb");
    case "annual":
      return num != null ? t("book.annual", { number: num }) : t("format.annual");
    case "omnibus":
      return num != null
        ? t("book.omnibus", { number: num })
        : t("format.omnibus");
    case "one_shot":
      return t("book.oneShot");
    default:
      // special | graphic_novel | other — or any future format
      return t(`format.${format}` as Parameters<typeof t>[0]);
  }
}

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------
interface ComicBookListProps {
  books: ComicBookListItem[];
  seriesId: string;
  onEditBook?: (id: string) => void;
  onChangeBookCover?: (id: string) => void;
  onDeleteBook?: (id: string) => void;
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------
export function ComicBookList({
  books,
  seriesId,
  onEditBook,
  onChangeBookCover,
  onDeleteBook,
}: ComicBookListProps) {
  const t = useTranslations("comics");

  if (books.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("detail.noBooks")}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {books.map((book) => (
        <BookRow
          key={book.id}
          book={book}
          seriesId={seriesId}
          t={t}
          onEditBook={onEditBook}
          onChangeBookCover={onChangeBookCover}
          onDeleteBook={onDeleteBook}
        />
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------
// BookRow — extracted to keep the list render clean
// -----------------------------------------------------------------------
interface BookRowProps {
  book: ComicBookListItem;
  seriesId: string;
  t: ReturnType<typeof useTranslations<"comics">>;
  onEditBook?: (id: string) => void;
  onChangeBookCover?: (id: string) => void;
  onDeleteBook?: (id: string) => void;
}

function BookRow({
  book,
  seriesId,
  t,
  onEditBook,
  onChangeBookCover,
  onDeleteBook,
}: BookRowProps) {
  const isMissing = book.status === "missing";
  const detailHref = `/comics/${seriesId}/books/${book.id}`;

  const designation = formatDesignation(book, t);

  const coverYear =
    book.coverDate != null
      ? new Date(book.coverDate).getFullYear()
      : null;

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    window.open(`/api/comics/books/${book.id}/download`, "_blank");
  };

  return (
    <li className="flex items-center gap-3 py-3">
      {/* Cover thumbnail — wrapped in Link; dropdown is a sibling */}
      <Link
        href={detailHref}
        prefetch={false}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {/* Thumbnail */}
        <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded">
          {book.coverUrl ? (
            <Image
              src={book.coverUrl}
              alt={designation}
              fill
              sizes="48px"
              className={`object-cover ${isMissing ? "opacity-50 grayscale" : ""}`}
              unoptimized={book.coverUrl.startsWith("/api/")}
            />
          ) : (
            <div
              className={`flex h-full items-center justify-center bg-muted ${isMissing ? "opacity-50 grayscale" : ""}`}
            >
              <span className="text-lg text-muted-foreground" aria-hidden="true">
                📖
              </span>
            </div>
          )}
          {isMissing && (
            <div className="absolute inset-0 flex items-center justify-center bg-destructive/20">
              <AlertTriangle className="h-3 w-3 text-destructive" />
            </div>
          )}
        </div>

        {/* Text block */}
        <div className="min-w-0 flex-1 space-y-0.5">
          {/* Primary: format-aware designation */}
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{designation}</span>
            {isMissing && (
              <Badge variant="destructive" className="shrink-0 text-xs">
                {t("card.missing")}
              </Badge>
            )}
          </div>

          {/* Secondary: optional title */}
          {book.title && (
            <p className="truncate text-xs text-muted-foreground">
              {book.title}
            </p>
          )}

          {/* Meta row: cover year · file size */}
          <p className="text-xs text-muted-foreground">
            {[
              coverYear != null ? String(coverYear) : null,
              formatFileSize(book.sizeBytes),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </Link>

      {/* Dropdown menu — sibling to the Link so its clicks don't trigger navigation */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={t("card.menu")}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={detailHref} prefetch={false}>
              <Eye className="h-4 w-4" />
              {t("book.view")}
            </Link>
          </DropdownMenuItem>

          {!isMissing && (
            <DropdownMenuItem onClick={handleDownload}>
              <Download className="h-4 w-4" />
              {t("card.download")}
            </DropdownMenuItem>
          )}

          {(onEditBook || onChangeBookCover) && <DropdownMenuSeparator />}

          {onEditBook && (
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                onEditBook(book.id);
              }}
            >
              <Pencil className="h-4 w-4" />
              {t("card.edit")}
            </DropdownMenuItem>
          )}

          {onChangeBookCover && (
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                onChangeBookCover(book.id);
              }}
            >
              <ImageIcon className="h-4 w-4" />
              {t("card.changeCover")}
            </DropdownMenuItem>
          )}

          {onDeleteBook && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onDeleteBook(book.id);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                {t("card.delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
