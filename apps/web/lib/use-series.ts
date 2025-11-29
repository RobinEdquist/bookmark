"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface SeriesAudiobook {
  id: string;
  coverUrl: string | null;
}

export interface SeriesWithBooks {
  id: string;
  name: string;
  bookCount: number;
  audiobooks: SeriesAudiobook[];
  lastUpdated: string;
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
