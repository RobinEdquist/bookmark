"use client";

import { useQuery } from "@tanstack/react-query";

export interface Tag {
  value: string;
  label: string;
}

// TODO: Replace with actual API endpoint (GET /api/tags) when audiobook tagging is implemented.
// The endpoint should return all unique tags from audiobooks in the library.
// Common content filter tags - static list until audiobooks are implemented
const CONTENT_FILTER_TAGS: Tag[] = [
  { value: "explicit", label: "Explicit Content" },
  { value: "erotica", label: "Erotica" },
  { value: "violence", label: "Violence" },
  { value: "horror", label: "Horror" },
  { value: "gore", label: "Gore" },
  { value: "adult", label: "Adult Themes" },
  { value: "drugs", label: "Drug Use" },
  { value: "language", label: "Strong Language" },
];

async function fetchTags(): Promise<Tag[]> {
  // TODO: Replace with actual API call when audiobook tags are implemented
  // const res = await fetch("/api/tags", { credentials: "include" });
  // if (!res.ok) throw new Error("Failed to fetch tags");
  // return res.json();
  return CONTENT_FILTER_TAGS;
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: fetchTags,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
