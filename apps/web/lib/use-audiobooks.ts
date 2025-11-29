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
  status: "available" | "missing" | "importing";
  authors: AudiobookAuthor[];
  series: AudiobookSeries[];
  hardcoverLinked: boolean;
  hardcoverRating: number | null;
  hardcoverRatingsCount: number | null;
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
    placeholderData: (previousData) => previousData,
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

async function refreshChapters(id: string): Promise<{ count: number }> {
  const response = await fetch(`/api/audiobooks/${id}/refresh-chapters`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to refresh chapters");
  }

  return response.json();
}

export function useRefreshChapters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => refreshChapters(id),
    onSuccess: (_, id) => {
      // Invalidate the audiobook detail to refetch with new chapters
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.detail(id) });
    },
  });
}

export interface Person {
  id: string;
  name: string;
}

async function fetchAuthors(search?: string): Promise<Person[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const response = await fetch(`/api/audiobooks/authors?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch authors");
  }

  return response.json();
}

export function useAuthors(search?: string) {
  return useQuery({
    queryKey: queryKeys.audiobooks.authors(search),
    queryFn: () => fetchAuthors(search),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function fetchNarrators(search?: string): Promise<Person[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const response = await fetch(`/api/audiobooks/narrators?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch narrators");
  }

  return response.json();
}

export function useNarrators(search?: string) {
  return useQuery({
    queryKey: queryKeys.audiobooks.narrators(search),
    queryFn: () => fetchNarrators(search),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function fetchPublishers(search?: string): Promise<string[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const response = await fetch(`/api/audiobooks/publishers?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch publishers");
  }

  return response.json();
}

export function usePublishers(search?: string) {
  return useQuery({
    queryKey: queryKeys.audiobooks.publishers(search),
    queryFn: () => fetchPublishers(search),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function fetchGenres(search?: string): Promise<{ id: string; name: string }[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const response = await fetch(`/api/audiobooks/genres?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch genres");
  }

  return response.json();
}

export function useGenres(search?: string) {
  return useQuery({
    queryKey: queryKeys.audiobooks.genres(search),
    queryFn: () => fetchGenres(search),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function fetchTags(search?: string): Promise<{ id: string; name: string }[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const response = await fetch(`/api/audiobooks/tags?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch tags");
  }

  return response.json();
}

export function useTags(search?: string) {
  return useQuery({
    queryKey: queryKeys.audiobooks.tags(search),
    queryFn: () => fetchTags(search),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function deleteAudiobook(id: string, deleteFiles: boolean): Promise<void> {
  const params = new URLSearchParams();
  params.set("deleteFiles", String(deleteFiles));

  const response = await fetch(`/api/audiobooks/${id}?${params}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to delete audiobook");
  }
}

export function useDeleteAudiobook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) =>
      deleteAudiobook(id, deleteFiles),
    onSuccess: (_, { id }) => {
      // Invalidate the list
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: queryKeys.audiobooks.detail(id) });
    },
  });
}

interface UpdateCoverParams {
  audiobookId: string;
  file?: File;
  url?: string;
}

async function updateCover({ audiobookId, file, url }: UpdateCoverParams): Promise<{ coverUrl: string }> {
  const formData = new FormData();

  if (file) {
    formData.append("file", file);
  } else if (url) {
    formData.append("url", url);
  }

  const response = await fetch(`/api/audiobooks/${audiobookId}/cover`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to update cover");
  }

  return response.json();
}

export function useUpdateCover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCover,
    onSuccess: (_, { audiobookId }) => {
      // Invalidate the list to refresh cover thumbnails
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
      // Invalidate the detail to refresh cover
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.detail(audiobookId) });
    },
  });
}
