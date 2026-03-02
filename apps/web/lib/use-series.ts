"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface SeriesAudiobook {
  id: string;
  coverUrl: string | null;
}

export interface SeriesEbook {
  id: string;
  coverUrl: string | null;
}

export interface SeriesWithBooks {
  id: string;
  name: string;
  bookCount: number;
  audiobooks: SeriesAudiobook[];
  ebooks: SeriesEbook[];
  lastUpdated: string;
}

export interface SeriesDetailAudiobook {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  duration: number | null;
  authors: { name: string }[];
  order: string;
  status: "available" | "missing" | "importing" | "hidden";
}

export interface SeriesDetailEbook {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  authors: { name: string }[];
  order: string;
  status: "available" | "missing" | "importing" | "hidden";
}

export interface SeriesDetail {
  id: string;
  name: string;
  description: string | null;
  audiobooks: SeriesDetailAudiobook[];
  ebooks: SeriesDetailEbook[];
  audiobookCount: number;
  ebookCount: number;
}

export interface UpdateSeriesData {
  name: string;
}

export interface UpdatedSeries {
  id: string;
  name: string;
  description: string | null;
}

export type SeriesSortBy = "name" | "lastUpdated" | "bookCount";
export type SeriesSortOrder = "asc" | "desc";

export interface SeriesFilters {
  search?: string;
  sortBy?: SeriesSortBy;
  sortOrder?: SeriesSortOrder;
}

async function fetchRecentlyUpdatedSeries(
  limit: number = 12
): Promise<{ series: SeriesWithBooks[] }> {
  const params = new URLSearchParams();
  params.set("limit", limit.toString());

  const response = await fetch(`/api/series/recently-updated?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch recently updated series");
  }

  return response.json();
}

export function useRecentlyUpdatedSeries(limit?: number) {
  return useQuery({
    queryKey: queryKeys.series.recentlyUpdated(limit),
    queryFn: () => fetchRecentlyUpdatedSeries(limit),
    staleTime: 60 * 1000, // 1 minute
  });
}

async function fetchAllSeries(
  limit: number = 50,
  offset: number = 0
): Promise<{ series: SeriesWithBooks[]; total: number }> {
  const params = new URLSearchParams();
  params.set("limit", limit.toString());
  params.set("offset", offset.toString());

  const response = await fetch(`/api/series?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch series");
  }

  return response.json();
}

export function useSeries(limit?: number, offset?: number) {
  return useQuery({
    queryKey: queryKeys.series.list({ limit, offset }),
    queryFn: () => fetchAllSeries(limit, offset),
    staleTime: 60 * 1000, // 1 minute
  });
}

export interface SeriesOption {
  id: string;
  name: string;
}

async function fetchSeriesOptions(
  search?: string
): Promise<SeriesOption[]> {
  const params = new URLSearchParams();
  if (search) {
    params.set("search", search);
  }

  const response = await fetch(`/api/audiobooks/series?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch series options");
  }

  return response.json();
}

export function useSeriesOptions(search?: string) {
  return useQuery({
    queryKey: queryKeys.series.options(search),
    queryFn: () => fetchSeriesOptions(search),
    staleTime: 60 * 1000, // 1 minute
  });
}

// Fetch series detail by ID
async function fetchSeriesDetail(id: string): Promise<SeriesDetail> {
  const response = await fetch(`/api/series/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch series detail");
  }

  return response.json();
}

export function useSeriesDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.series.detail(id),
    queryFn: () => fetchSeriesDetail(id),
    staleTime: 60 * 1000, // 1 minute
    enabled: !!id,
  });
}

async function updateSeries(
  id: string,
  data: UpdateSeriesData
): Promise<UpdatedSeries> {
  const response = await fetch(`/api/series/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update series");
  }

  return response.json();
}

export function useUpdateSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSeriesData }) =>
      updateSeries(id, data),
    onSuccess: (updatedSeries) => {
      queryClient.setQueryData<SeriesDetail | undefined>(
        queryKeys.series.detail(updatedSeries.id),
        (previous) =>
          previous
            ? {
                ...previous,
                name: updatedSeries.name,
                description: updatedSeries.description,
              }
            : previous
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
    },
  });
}

// Fetch series with infinite scroll
const PAGE_SIZE = 24;

async function fetchSeriesPage(
  filters: SeriesFilters,
  pageParam: number
): Promise<{ series: SeriesWithBooks[]; total: number; nextOffset: number | null }> {
  const params = new URLSearchParams();
  params.set("limit", PAGE_SIZE.toString());
  params.set("offset", pageParam.toString());

  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.sortBy) {
    params.set("sortBy", filters.sortBy);
  }
  if (filters.sortOrder) {
    params.set("sortOrder", filters.sortOrder);
  }

  const response = await fetch(`/api/series?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch series");
  }

  const data = await response.json();
  const nextOffset = pageParam + PAGE_SIZE < data.total ? pageParam + PAGE_SIZE : null;

  return {
    series: data.series,
    total: data.total,
    nextOffset,
  };
}

export function useInfiniteSeries(filters: SeriesFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.series.infinite(filters),
    queryFn: ({ pageParam }) => fetchSeriesPage(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: 60 * 1000, // 1 minute
  });
}
