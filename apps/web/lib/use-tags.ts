"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface Tag {
  value: string;
  label: string;
}

interface ApiTag {
  id: string;
  name: string;
}

async function fetchTags(): Promise<Tag[]> {
  const res = await fetch("/api/audiobooks/tags", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch tags");
  const tags: ApiTag[] = await res.json();
  // Map API response to Tag format (id -> value, name -> label)
  return tags.map((tag) => ({ value: tag.id, label: tag.name }));
}

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags.all,
    queryFn: fetchTags,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
