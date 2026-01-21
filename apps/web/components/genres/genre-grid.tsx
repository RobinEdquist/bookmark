"use client";

import { useTranslations } from "next-intl";
import { GenreCard } from "./genre-card";
import type { GenreWithCount, ContentType } from "../../lib/use-genres";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

interface GenreGridProps {
  genres: GenreWithCount[] | undefined;
  contentType: ContentType;
  isLoading: boolean;
  onGenreSelect: (genreId: string) => void;
}

export function GenreGrid({ genres, contentType, isLoading, onGenreSelect }: GenreGridProps) {
  const t = useTranslations("common.genres");

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!genres || genres.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {genres.map((genre, index) => (
        <GenreCard
          key={genre.id}
          genre={genre}
          contentType={contentType}
          onClick={() => onGenreSelect(genre.id)}
          index={index}
        />
      ))}
    </div>
  );
}
