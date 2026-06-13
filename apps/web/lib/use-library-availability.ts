"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface LibraryAvailability {
  audiobooks: boolean;
  ebooks: boolean;
  comics: boolean;
  opds: boolean;
}

async function fetchLibraryAvailability(): Promise<LibraryAvailability> {
  const response = await fetch("/api/library/availability", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch library availability");
  }
  return response.json();
}

export function useLibraryAvailability() {
  return useQuery({
    queryKey: queryKeys.library.availability(),
    queryFn: fetchLibraryAvailability,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
