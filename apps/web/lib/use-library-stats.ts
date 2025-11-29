"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface LibraryStats {
  audiobookCount: number;
  totalDuration: number;
  seriesCount: number;
  authorCount: number;
}

async function fetchLibraryStats(): Promise<LibraryStats> {
  const response = await fetch("/api/library/stats", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch library stats");
  }

  return response.json();
}

export function useLibraryStats() {
  return useQuery({
    queryKey: queryKeys.library.stats(),
    queryFn: fetchLibraryStats,
    staleTime: 60 * 1000, // 1 minute
  });
}
