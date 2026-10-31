"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import type { ComicSeriesListItem } from "./use-comics";
import type { ComicCollectionListItem } from "./use-comic-collections";

export interface ComicCharacterListItem {
  id: string;
  name: string;
  seriesCount: number;
  coverUrl: string | null;
}

export interface ComicCharacterDetail {
  id: string;
  name: string;
  soloSeries: ComicSeriesListItem[];
  teamUps: ComicSeriesListItem[];
  collections: ComicCollectionListItem[];
}

interface ComicCharacterFilters {
  search?: string;
  limit?: number;
  offset?: number;
}

const PER_PAGE = 50;

async function fetchCharacters(
  f: ComicCharacterFilters,
): Promise<{ characters: ComicCharacterListItem[]; total: number }> {
  const p = new URLSearchParams();
  if (f.search) p.set("search", f.search);
  if (f.limit != null) p.set("limit", String(f.limit));
  if (f.offset != null) p.set("offset", String(f.offset));
  const r = await fetch(`/api/comics/characters?${p}`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error("Failed to fetch characters");
  return r.json();
}

export function useInfiniteComicCharacters(f: { search?: string } = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.comics.characters(f),
    queryFn: ({ pageParam = 0 }) =>
      fetchCharacters({ ...f, limit: PER_PAGE, offset: pageParam }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((a, p) => a + p.characters.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    initialPageParam: 0,
    placeholderData: (prev) => prev,
    // Keep loaded pages cached while browsing detail pages so returning to
    // the list renders instantly at full height (scroll restoration)
    gcTime: 30 * 60 * 1000,
  });
}

/** First matches for a name, for picking a character in a form. */
export function useComicCharacterSuggestions(search: string) {
  return useQuery({
    queryKey: queryKeys.comics.characterSuggestions(search),
    queryFn: () => fetchCharacters({ search: search || undefined, limit: 20 }),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
  });
}

export function useComicCharacter(id: string) {
  return useQuery({
    queryKey: queryKeys.comics.characterDetail(id),
    queryFn: async (): Promise<ComicCharacterDetail> => {
      const r = await fetch(`/api/comics/characters/${id}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to fetch character");
      return r.json();
    },
    enabled: !!id,
  });
}
