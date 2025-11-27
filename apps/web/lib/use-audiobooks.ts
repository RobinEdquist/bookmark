"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface AudiobookAuthor {
  id: string;
  name: string;
  imageUrl?: string | null;
}

export interface AudiobookNarrator {
  id: string;
  name: string;
  imageUrl?: string | null;
}

export interface AudiobookSeries {
  id: string;
  name: string;
  order: string;
}

export interface AudiobookGenre {
  id: string;
  name: string;
}

export interface AudiobookTag {
  id: string;
  name: string;
}

export interface AudiobookFile {
  id: string;
  filePath: string;
  fileName: string;
  order: number;
  duration: number;
  format: string;
  bitrate: number | null;
  sampleRate: number | null;
  sizeBytes: number;
}

export interface AudiobookChapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number | null;
  order: number;
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

export interface AudiobookDetail {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  publisher: string | null;
  language: string | null;
  publishedDate: string | null;
  isbn: string | null;
  asin: string | null;
  duration: number | null;
  coverUrl: string | null;
  isExplicit: boolean;
  status: "available" | "missing" | "importing";
  createdAt: string;
  updatedAt: string;
  authors: AudiobookAuthor[];
  narrators: AudiobookNarrator[];
  series: AudiobookSeries[];
  genres: AudiobookGenre[];
  tags: AudiobookTag[];
  files: AudiobookFile[];
  chapters: AudiobookChapter[];
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

async function fetchAudiobook(id: string): Promise<AudiobookDetail> {
  const response = await fetch(`/api/audiobooks/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch audiobook");
  }

  return response.json();
}

export function useAudiobook(id: string) {
  return useQuery({
    queryKey: queryKeys.audiobooks.detail(id),
    queryFn: () => fetchAudiobook(id),
    enabled: !!id,
  });
}

export interface UpdateAudiobookData {
  title?: string;
  subtitle?: string;
  description?: string;
  publisher?: string;
  language?: string;
  publishedDate?: string;
  isbn?: string;
  asin?: string;
  isExplicit?: boolean;
  authorNames?: string[];
  narratorNames?: string[];
  genreNames?: string[];
  tagNames?: string[];
}

async function updateAudiobook(
  id: string,
  data: UpdateAudiobookData
): Promise<AudiobookDetail> {
  const response = await fetch(`/api/audiobooks/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update audiobook");
  }

  return response.json();
}

export function useUpdateAudiobook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAudiobookData }) =>
      updateAudiobook(id, data),
    onSuccess: (updatedAudiobook) => {
      // Update the detail cache
      queryClient.setQueryData(
        queryKeys.audiobooks.detail(updatedAudiobook.id),
        updatedAudiobook
      );
      // Invalidate the list to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
    },
  });
}
