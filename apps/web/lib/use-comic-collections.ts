"use client";

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import type { ComicSeriesListItem } from "./use-comics";

export interface ComicCollectionListItem {
  id: string;
  name: string;
  seriesCount: number;
  coverUrl: string | null;
  createdAt: string;
}

export interface ComicCollectionDetail {
  id: string;
  name: string;
  sortName: string | null;
  description: string | null;
  coverUrl: string | null;
  series: ComicSeriesListItem[];
}

export interface ComicCollectionFilters {
  search?: string;
  sortBy?: "name" | "recentlyAdded";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

const PER_PAGE = 50;

function buildParams(f: ComicCollectionFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set("search", f.search);
  if (f.sortBy) p.set("sortBy", f.sortBy);
  if (f.sortOrder) p.set("sortOrder", f.sortOrder);
  if (f.limit != null) p.set("limit", String(f.limit));
  if (f.offset != null) p.set("offset", String(f.offset));
  return p;
}

async function fetchCollections(f: ComicCollectionFilters = {}): Promise<{ collections: ComicCollectionListItem[]; total: number }> {
  const r = await fetch(`/api/comics/collections?${buildParams(f)}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch collections");
  return r.json();
}

export function useInfiniteComicCollections(f: Omit<ComicCollectionFilters, "limit" | "offset"> = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.comics.collections(f),
    queryFn: ({ pageParam = 0 }) => fetchCollections({ ...f, limit: PER_PAGE, offset: pageParam }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((a, p) => a + p.collections.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    initialPageParam: 0,
    placeholderData: (prev) => prev,
    // Keep loaded pages cached while browsing detail pages so returning to
    // the list renders instantly at full height (scroll restoration)
    gcTime: 30 * 60 * 1000,
  });
}

export function useComicCollection(id: string) {
  return useQuery({
    queryKey: queryKeys.comics.collectionDetail(id),
    queryFn: async (): Promise<ComicCollectionDetail> => {
      const r = await fetch(`/api/comics/collections/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch collection");
      return r.json();
    },
    enabled: !!id,
  });
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`POST ${url} failed`);
  return r.json();
}

export function useCreateComicCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string | null }) =>
      post<{ id: string }>("/api/comics/collections", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.comics.all }),
  });
}

export function useAddSeriesToCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, seriesId }: { collectionId: string; seriesId: string }) =>
      post<{ success: boolean }>(`/api/comics/collections/${collectionId}/series`, { seriesId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.comics.all }),
  });
}

export function useRemoveSeriesFromCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, seriesId }: { collectionId: string; seriesId: string }) => {
      const r = await fetch(`/api/comics/collections/${collectionId}/series/${seriesId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed to remove series");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.comics.all }),
  });
}

export function useUpdateComicCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; description?: string | null } }) => {
      const r = await fetch(`/api/comics/collections/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("Failed to update collection");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.comics.all }),
  });
}

export function useDeleteComicCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/comics/collections/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed to delete collection");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.comics.all }),
  });
}
