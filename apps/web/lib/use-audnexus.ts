"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

// Types matching backend responses
export interface AudibleSearchResult {
  asin: string;
  title: string;
  subtitle?: string;
  authors: string[];
  narrators: string[];
  coverUrl?: string;
  durationMinutes?: number;
  releaseDate?: string;
  language?: string;
  publisher?: string;
}

export interface AudnexusBookDetail {
  asin: string;
  title: string;
  subtitle?: string;
  description?: string;
  authors: string[];
  narrators: string[];
  publisher?: string;
  releaseDate?: string;
  isbn?: string;
  language?: string;
  genres: string[];
  tags: string[];
  series: { name: string; position?: string }[];
  coverUrl?: string;
}

export interface ChapterData {
  title: string;
  startTime: number;
  endTime?: number;
  lengthSeconds: number;
}

export interface ChaptersResponse {
  asin: string;
  chapters: ChapterData[];
  totalDuration: number;
  isAccurate: boolean;
}

interface SearchResponse {
  results: AudibleSearchResult[];
  total: number;
}

async function searchAudible(
  title: string,
  author?: string,
  region = "us"
): Promise<SearchResponse> {
  const params = new URLSearchParams({ title, region });
  if (author) params.set("author", author);

  const res = await fetch(`/api/audnexus/search?${params.toString()}`, {
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to search Audible");
  }

  return res.json();
}

async function fetchBookByAsin(
  asin: string,
  region = "us"
): Promise<AudnexusBookDetail> {
  const res = await fetch(`/api/audnexus/book/${asin}?region=${region}`, {
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("No book found for this ASIN");
    }
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch book details");
  }

  return res.json();
}

async function fetchChaptersByAsin(
  asin: string,
  region = "us"
): Promise<ChaptersResponse> {
  const res = await fetch(`/api/audnexus/chapters/${asin}?region=${region}`, {
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("No chapters found for this ASIN");
    }
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch chapters");
  }

  return res.json();
}

async function importChapters(
  audiobookId: string,
  asin: string,
  chapters: ChapterData[]
): Promise<{ count: number }> {
  const res = await fetch(`/api/audiobooks/${audiobookId}/chapters/import`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      asin,
      chapters: chapters.map((c) => ({
        title: c.title,
        startTime: c.startTime,
        endTime: c.endTime,
      })),
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to import chapters");
  }

  return res.json();
}

/**
 * Search Audible catalog by title and optionally author
 */
export function useAudibleSearch(
  title: string,
  author?: string,
  options?: { enabled?: boolean; region?: string }
) {
  const region = options?.region ?? "us";
  return useQuery({
    queryKey: queryKeys.audnexus.search(title, author, region),
    queryFn: () => searchAudible(title, author, region),
    enabled: options?.enabled ?? (title.length >= 2),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch full book metadata from Audnexus by ASIN
 */
export function useAudnexusBook(
  asin: string,
  region = "us",
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.audnexus.book(asin, region),
    queryFn: () => fetchBookByAsin(asin, region),
    enabled: (options?.enabled ?? true) && asin.length === 10,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: false, // Don't retry on 404
  });
}

/**
 * Fetch chapters from Audnexus by ASIN
 */
export function useAudnexusChapters(
  asin: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.audnexus.chapters(asin),
    queryFn: () => fetchChaptersByAsin(asin),
    enabled: options?.enabled ?? (asin.length === 10),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: false, // Don't retry on 404
  });
}

/**
 * Import external chapters into an audiobook
 */
export function useImportChapters(audiobookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      asin,
      chapters,
    }: {
      asin: string;
      chapters: ChapterData[];
    }) => importChapters(audiobookId, asin, chapters),
    onSuccess: () => {
      // Invalidate the audiobook detail to refresh chapters
      queryClient.invalidateQueries({
        queryKey: queryKeys.audiobooks.detail(audiobookId),
      });
    },
  });
}
