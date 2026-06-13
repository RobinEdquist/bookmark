"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { GenreGrid } from "./genre-grid";
import { AudiobookGrid } from "../audiobooks/audiobook-grid";
import { EbookGrid } from "../ebooks/ebook-grid";
import { ComicSeriesGrid } from "../comics/comic-series-grid";
import { useGenres, type ContentType } from "../../lib/use-genres";
import { useInfiniteAudiobooks } from "../../lib/use-audiobooks";
import { useInfiniteEbooks } from "../../lib/use-ebooks";
import { useInfiniteComicSeries } from "../../lib/use-comics";
import { useLibraryAvailability } from "../../lib/use-library-availability";

export function GenresPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("common.genres");
  const { data: availability } = useLibraryAvailability();

  // Determine which types are available
  const showAudiobooks = availability?.audiobooks ?? false;
  const showEbooks = availability?.ebooks ?? false;
  const showComics = availability?.comics ?? false;

  // Valid content types based on availability (for URL param validation)
  const availableTypes: ContentType[] = [
    ...(showAudiobooks ? (["audiobooks"] as ContentType[]) : []),
    ...(showEbooks ? (["ebooks"] as ContentType[]) : []),
    ...(showComics ? (["comics"] as ContentType[]) : []),
  ];
  const defaultType: ContentType = availableTypes[0] ?? "audiobooks";

  // Get current state from URL, falling back to default if unavailable type requested
  const rawType = searchParams.get("type") as ContentType | null;
  const contentType: ContentType =
    rawType && availableTypes.includes(rawType) ? rawType : defaultType;
  const selectedGenreId = searchParams.get("genre");

  // Fetch genres for current content type
  const { data: genres, isLoading: genresLoading } = useGenres(contentType);

  // Find selected genre name for header
  const selectedGenre = genres?.find((g) => g.id === selectedGenreId);

  // Fetch items when a genre is selected
  // Only pass filters when we have a selected genre, otherwise pass empty object to disable fetching
  const audiobooksQuery = useInfiniteAudiobooks(
    selectedGenreId && contentType === "audiobooks"
      ? { genreId: selectedGenreId }
      : {}
  );

  const ebooksQuery = useInfiniteEbooks(
    selectedGenreId && contentType === "ebooks"
      ? { genreId: selectedGenreId }
      : {}
  );

  const comicsQuery = useInfiniteComicSeries(
    selectedGenreId && contentType === "comics"
      ? { genreId: selectedGenreId }
      : {}
  );

  // URL state management
  const updateUrl = useCallback(
    (type: ContentType, genreId?: string) => {
      const params = new URLSearchParams();
      params.set("type", type);
      if (genreId) params.set("genre", genreId);
      router.push(`/genres?${params.toString()}`);
    },
    [router]
  );

  const handleTypeChange = useCallback(
    (type: string) => {
      updateUrl(type as ContentType);
    },
    [updateUrl]
  );

  const handleGenreSelect = useCallback(
    (genreId: string) => {
      updateUrl(contentType, genreId);
    },
    [contentType, updateUrl]
  );

  const handleBack = useCallback(() => {
    updateUrl(contentType);
  }, [contentType, updateUrl]);

  // Show tabs only when at least 2 types are available
  const availableCount = [showAudiobooks, showEbooks, showComics].filter(Boolean).length;
  const showToggle = availableCount >= 2;

  // Extract items from query data
  const audiobooks = audiobooksQuery.data?.pages.flatMap((p) => p.audiobooks) ?? [];
  const ebooks = ebooksQuery.data?.pages.flatMap((p) => p.ebooks) ?? [];
  const comicSeries = comicsQuery.data?.pages.flatMap((p) => p.series) ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 py-2">
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {selectedGenreId && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <Button variant="ghost" size="sm" onClick={handleBack}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t("back")}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <h1 className="text-2xl font-bold">
            {selectedGenre?.name || t("title")}
          </h1>
        </div>

        {showToggle && (
          <Tabs value={contentType} onValueChange={handleTypeChange}>
            <TabsList>
              {showAudiobooks && (
                <TabsTrigger value="audiobooks">{t("audiobooks")}</TabsTrigger>
              )}
              {showEbooks && (
                <TabsTrigger value="ebooks">{t("ebooks")}</TabsTrigger>
              )}
              {showComics && (
                <TabsTrigger value="comics">{t("comics")}</TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {selectedGenreId ? (
          <motion.div
            key="items"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {contentType === "audiobooks" ? (
              <AudiobookGrid
                audiobooks={audiobooks}
                isLoading={audiobooksQuery.isLoading}
                isFetchingNextPage={audiobooksQuery.isFetchingNextPage}
                hasNextPage={audiobooksQuery.hasNextPage}
                onLoadMore={audiobooksQuery.fetchNextPage}
                error={audiobooksQuery.error}
              />
            ) : contentType === "ebooks" ? (
              <EbookGrid
                ebooks={ebooks}
                isLoading={ebooksQuery.isLoading}
                isFetchingNextPage={ebooksQuery.isFetchingNextPage}
                hasNextPage={ebooksQuery.hasNextPage}
                onLoadMore={ebooksQuery.fetchNextPage}
                error={ebooksQuery.error}
              />
            ) : (
              <ComicSeriesGrid
                series={comicSeries}
                isLoading={comicsQuery.isLoading}
                isFetchingNextPage={comicsQuery.isFetchingNextPage}
                hasNextPage={comicsQuery.hasNextPage}
                onLoadMore={comicsQuery.fetchNextPage}
                error={comicsQuery.error}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="genres"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <GenreGrid
              genres={genres}
              contentType={contentType}
              isLoading={genresLoading}
              onGenreSelect={handleGenreSelect}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
