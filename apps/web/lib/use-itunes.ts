"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

// Types matching backend responses
export interface ItunesSearchResult {
  id: number;
  title: string;
  author?: string;
  description?: string;
  genres: string[];
  releaseDate?: string;
  coverUrl?: string;
}

export type ItunesMediaType = "audiobook" | "ebook";

interface SearchResponse {
  results: ItunesSearchResult[];
  total: number;
}

async function searchItunes(
  term: string,
  media: ItunesMediaType,
  country = "US",
): Promise<SearchResponse> {
  const params = new URLSearchParams({ term, media, country });

  const res = await fetch(`/api/itunes/search?${params.toString()}`, {
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to search iTunes");
  }

  return res.json();
}

/**
 * Search the iTunes Store catalog for audiobooks or ebooks.
 * Searches should be button-triggered (pass enabled explicitly) —
 * the iTunes API rate limits at roughly 20 requests per minute.
 */
export function useItunesSearch(
  term: string,
  media: ItunesMediaType,
  country = "US",
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.itunes.search(term, media, country),
    queryFn: () => searchItunes(term, media, country),
    enabled: (options?.enabled ?? false) && term.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
