"use client";

import { useQuery } from "@tanstack/react-query";

export interface GenreWithCount {
  id: string;
  name: string;
  count: number;
}

export type ContentType = "audiobooks" | "ebooks" | "comics";

const queryKeys = {
  genres: (type: ContentType, search?: string) => ["genres", type, search] as const,
};

async function fetchGenres(type: ContentType, search?: string): Promise<GenreWithCount[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const endpoint =
    type === "audiobooks"
      ? "/api/audiobooks/genres"
      : type === "ebooks"
        ? "/api/ebooks/genres"
        : "/api/comics/genres";
  const response = await fetch(`${endpoint}?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch genres");
  }

  return response.json();
}

export function useGenres(type: ContentType, search?: string) {
  return useQuery({
    queryKey: queryKeys.genres(type, search),
    queryFn: () => fetchGenres(type, search),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
