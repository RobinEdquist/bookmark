"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface AudiobookAuthor {
  id: string;
  name: string;
}

export interface AudiobookSeries {
  id: string;
  name: string;
  order: string;
}

export interface AudiobookListItem {
  id: string;
  title: string;
  subtitle: string | null;
  duration: number | null;
  coverUrl: string | null;
  createdAt: string;
  authors: AudiobookAuthor[];
  series: AudiobookSeries[];
}

export interface AudiobookFilters {
  search?: string;
  genreId?: string;
  seriesId?: string;
  language?: string;
  sortBy?: "title" | "createdAt" | "author";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

async function fetchAudiobooks(
  filters: AudiobookFilters = {}
): Promise<{ audiobooks: AudiobookListItem[]; total: number }> {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.genreId) params.set("genreId", filters.genreId);
  if (filters.seriesId) params.set("seriesId", filters.seriesId);
  if (filters.language) params.set("language", filters.language);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.offset) params.set("offset", filters.offset.toString());

  const response = await fetch(`/api/audiobooks?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch audiobooks");
  }

  return response.json();
}

export function useAudiobooks(filters: AudiobookFilters = {}) {
  return useQuery({
    queryKey: queryKeys.audiobooks.list(filters),
    queryFn: () => fetchAudiobooks(filters),
  });
}
