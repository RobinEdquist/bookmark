"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  GripVertical,
  Headphones,
  BookOpen,
  BookImage,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import type { ListItem } from "../../lib/use-lists";
import { cn } from "@repo/ui/lib/utils";

interface SortableListItemProps {
  item: ListItem;
  isOwner: boolean;
  onRemove?: (itemId: string) => void;
}

export function SortableListItem({
  item,
  isOwner,
  onRemove,
}: SortableListItemProps) {
  const t = useTranslations("lists.detail");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const content = item.audiobook || item.ebook || item.comicSeries;
  if (!content) return null;

  const isAudiobook = item.itemType === "audiobook";
  const isComicSeries = item.itemType === "comic_series";
  const href = isAudiobook
    ? `/audiobooks/${item.audiobookId}`
    : isComicSeries
      ? `/comics/${item.comicSeriesId}`
      : `/ebooks/${item.ebookId}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
        isDragging && "z-50 shadow-lg opacity-90",
        !isDragging && "hover:border-primary/30"
      )}
    >
      {/* Drag handle */}
      {isOwner && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={t("dragToReorder")}
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}

      {/* Cover */}
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded",
          isAudiobook ? "h-16 w-16" : "h-16 w-11"
        )}
      >
        {content.coverUrl ? (
          <Image
            src={content.coverUrl}
            alt={content.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            {isAudiobook ? (
              <Headphones className="h-6 w-6 text-muted-foreground" />
            ) : isComicSeries ? (
              <BookImage className="h-6 w-6 text-muted-foreground" />
            ) : (
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="font-medium hover:text-primary hover:underline"
        >
          {content.title}
        </Link>
        {"subtitle" in content && content.subtitle && (
          <p className="truncate text-sm text-muted-foreground">
            {content.subtitle}
          </p>
        )}
        {"authors" in content &&
          content.authors &&
          content.authors.length > 0 && (
            <p className="truncate text-sm text-muted-foreground">
              {content.authors.join(", ")}
            </p>
          )}
        {isComicSeries && "publisher" in content && content.publisher && (
          <p className="truncate text-sm text-muted-foreground">
            {content.publisher}
          </p>
        )}
      </div>

      {/* Type badge */}
      <div
        className={cn(
          "hidden shrink-0 rounded-full px-2 py-1 text-xs font-medium sm:block",
          isAudiobook
            ? "bg-primary/10 text-primary"
            : isComicSeries
              ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
              : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
        )}
      >
        {isAudiobook
          ? t("audiobook")
          : isComicSeries
            ? t("comicSeries")
            : t("ebook")}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href={href}>
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
        {isOwner && onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(item.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
