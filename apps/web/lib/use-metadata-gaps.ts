"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export type GapMediaType = "audiobook" | "ebook";

/**
 * How a gap can be closed. `link` gaps are the high-leverage ones — a single
 * external match often clears several at once — so the UI groups by this.
 */
export type GapFixMethod = "link" | "manual" | "file";

export type GapSort = "newest" | "oldest" | "title" | "mostGaps";

export interface MetadataGapItem {
  id: string;
  type: GapMediaType;
  title: string;
  subtitle: string | null;
  gaps: string[];
  gapCount: number;
  coverUrl: string | null;
  status: string;
  createdAt: string;
}

export interface MetadataGapList {
  items: MetadataGapItem[];
  total: number;
}

export interface MetadataGapCount {
  key: string;
  count: number;
  fixableBy: GapFixMethod;
}

export interface MetadataGapsSummary {
  type: GapMediaType;
  totalItems: number;
  itemsWithGaps: number;
  gaps: MetadataGapCount[];
}

export interface MetadataGapFilters {
  type: GapMediaType;
  missing?: string[];
  match?: "any" | "all";
  search?: string;
  sort?: GapSort;
  limit?: number;
  offset?: number;
}

async function fetchSummary(
  type: GapMediaType,
): Promise<MetadataGapsSummary> {
  const response = await fetch(`/api/metadata-gaps/summary?type=${type}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load metadata gap summary");
  }

  return response.json();
}

async function fetchGaps(
  filters: MetadataGapFilters,
): Promise<MetadataGapList> {
  const params = new URLSearchParams({ type: filters.type });

  if (filters.missing?.length) {
    params.set("missing", filters.missing.join(","));
  }
  if (filters.match) params.set("match", filters.match);
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined)
    params.set("offset", String(filters.offset));

  const response = await fetch(`/api/metadata-gaps?${params.toString()}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load items with missing metadata");
  }

  return response.json();
}

export function useMetadataGapsSummary(type: GapMediaType) {
  return useQuery({
    queryKey: queryKeys.metadataGaps.summary(type),
    queryFn: () => fetchSummary(type),
    staleTime: 30_000,
  });
}

export function useMetadataGaps(filters: MetadataGapFilters) {
  return useQuery({
    queryKey: queryKeys.metadataGaps.list(filters),
    queryFn: () => fetchGaps(filters),
    staleTime: 30_000,
    // Keeps the table on screen while a filter chip is toggled, so the page
    // does not collapse to a spinner on every click.
    placeholderData: (previous) => previous,
  });
}
