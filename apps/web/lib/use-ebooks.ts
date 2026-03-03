"use client";

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface EbookAuthor {
  id: string;
  name: string;
  imageUrl?: string | null;
}

export interface EbookSeries {
  id: string;
  name: string;
  order: string;
}

export interface EbookGenre {
  id: string;
  name: string;
}

export interface EbookTag {
  id: string;
  name: string;
}

export interface EbookListItem {
  id: string;
  title: string;
  subtitle: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  createdAt: string;
  status: "available" | "missing" | "hidden";
  authors: EbookAuthor[];
  series: EbookSeries[];
  hardcoverLinked: boolean;
  hardcoverRating: number | null;
  hardcoverRatingsCount: number | null;
  goodreadsLinked: boolean;
  goodreadsRating: number | null;
  goodreadsRatingsCount: number | null;
}

export interface EbookDetail {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  publisher: string | null;
  language: string | null;
  publishedDate: string | null;
  isbn: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  filePath: string;
  fileName: string;
  sizeBytes: number;
  format: string;
  status: "available" | "missing" | "hidden";
  createdAt: string;
  updatedAt: string;
  authors: EbookAuthor[];
  series: EbookSeries[];
  genres: EbookGenre[];
  tags: EbookTag[];
}

export interface EbookFilters {
  search?: string;
  genreId?: string;
  seriesId?: string;
  language?: string;
  sortBy?: "title" | "createdAt" | "author" | "rating" | "series";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

async function fetchEbooks(
  filters: EbookFilters = {}
): Promise<{ ebooks: EbookListItem[]; total: number }> {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.genreId) params.set("genreId", filters.genreId);
  if (filters.seriesId) params.set("seriesId", filters.seriesId);
  if (filters.language) params.set("language", filters.language);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.offset) params.set("offset", filters.offset.toString());

  const response = await fetch(`/api/ebooks?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch ebooks");
  }

  return response.json();
}

export function useEbooks(filters: EbookFilters = {}) {
  return useQuery({
    queryKey: queryKeys.ebooks.list(filters),
    queryFn: () => fetchEbooks(filters),
    placeholderData: (previousData) => previousData,
  });
}

const ITEMS_PER_PAGE = 50;

export function useInfiniteEbooks(
  filters: Omit<EbookFilters, "limit" | "offset"> = {}
) {
  return useInfiniteQuery({
    queryKey: queryKeys.ebooks.infinite(filters),
    queryFn: ({ pageParam = 0 }) =>
      fetchEbooks({ ...filters, limit: ITEMS_PER_PAGE, offset: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, page) => acc + page.ebooks.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    initialPageParam: 0,
    // Keep showing previous results while fetching new search results
    placeholderData: (previousData) => previousData,
  });
}

async function fetchEbook(id: string): Promise<EbookDetail> {
  const response = await fetch(`/api/ebooks/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch ebook");
  }

  return response.json();
}

export function useEbook(id: string) {
  return useQuery({
    queryKey: queryKeys.ebooks.detail(id),
    queryFn: () => fetchEbook(id),
    enabled: !!id,
  });
}

export interface UpdateEbookData {
  title?: string;
  subtitle?: string;
  description?: string;
  publisher?: string;
  language?: string;
  publishedDate?: string;
  isbn?: string;
  authorNames?: string[];
  genreNames?: string[];
  tagNames?: string[];
}

async function updateEbook(
  id: string,
  data: UpdateEbookData
): Promise<EbookDetail> {
  const response = await fetch(`/api/ebooks/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update ebook");
  }

  return response.json();
}

export function useUpdateEbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEbookData }) =>
      updateEbook(id, data),
    onSuccess: (updatedEbook) => {
      // Update the detail cache
      queryClient.setQueryData(
        queryKeys.ebooks.detail(updatedEbook.id),
        updatedEbook
      );
      // Invalidate the list to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
      // Invalidate series list/detail data in case series membership changed
      queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
      // Invalidate tags in case new tags were created
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
      // Invalidate lists/top-lists that surface ebook metadata
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
    },
  });
}

async function deleteEbook(id: string, deleteFiles: boolean): Promise<void> {
  const params = new URLSearchParams();
  params.set("deleteFiles", String(deleteFiles));

  const response = await fetch(`/api/ebooks/${id}?${params}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to delete ebook");
  }
}

export function useDeleteEbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) =>
      deleteEbook(id, deleteFiles),
    onSuccess: (_, { id }) => {
      // Invalidate the list
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
      // Invalidate series list/detail data in case this removal changed series
      queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: queryKeys.ebooks.detail(id) });
      // Invalidate lists/top-lists that may contain this ebook
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
    },
  });
}

interface UpdateEbookCoverParams {
  ebookId: string;
  file?: File;
  url?: string;
}

async function updateEbookCover({ ebookId, file, url }: UpdateEbookCoverParams): Promise<{ coverUrl: string }> {
  const formData = new FormData();

  if (file) {
    formData.append("file", file);
  } else if (url) {
    formData.append("url", url);
  }

  const response = await fetch(`/api/ebooks/${ebookId}/cover`, {
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

export function useUpdateEbookCover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateEbookCover,
    onSuccess: (_, { ebookId }) => {
      // Invalidate the list to refresh cover thumbnails
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
      // Invalidate the detail to refresh cover
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.detail(ebookId) });
      // Invalidate lists/top-lists to refresh covers there too
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
    },
  });
}

export interface EbookDownloadInfo {
  downloadUrl: string;
  fileName: string;
  sizeBytes: number;
}

async function fetchEbookDownloadInfo(id: string): Promise<EbookDownloadInfo> {
  const response = await fetch(`/api/ebooks/${id}/download`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get download info");
  }

  return response.json();
}

export function useEbookDownloadInfo(id: string) {
  return useQuery({
    queryKey: [...queryKeys.ebooks.detail(id), "download"] as const,
    queryFn: () => fetchEbookDownloadInfo(id),
    enabled: !!id,
  });
}
