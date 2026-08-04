"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import type { GoodreadsLinkStatus } from "./use-tasks";

export type MediaType = "audiobook" | "ebook";

export interface GrFinderSearchResult {
  title: string;
  author: string;
  goodreads_id: string;
  cover_url: string | null;
  avg_rating: string | null;
  url: string;
}

export interface GrFinderSearchResponse {
  query: string;
  count: number;
  results: GrFinderSearchResult[];
}

interface GrFinderStatus {
  configured: boolean;
}

// Goodreads link type
export interface GoodreadsLink {
  id: string;
  goodreadsId: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  url: string;
  rating: string | null;
  ratingsCount: number | null;
  genres: string[];
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface GoodreadsLinkResponse {
  link: GoodreadsLink | null;
}

async function fetchGrFinderStatus(): Promise<GrFinderStatus> {
  const response = await fetch("/api/gr-finder/status", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Goodreads Finder status");
  }
  return response.json();
}

export function useGrFinderStatus() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.grFinder.status(),
    queryFn: fetchGrFinderStatus,
  });

  return {
    isConfigured: data?.configured ?? false,
    isLoading,
    error,
  };
}

async function searchGrFinder(query: string): Promise<GrFinderSearchResponse> {
  const searchParams = new URLSearchParams({ q: query });
  const response = await fetch(`/api/gr-finder/search?${searchParams.toString()}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Search failed");
  }

  return response.json();
}

export function useGrFinderSearch(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.grFinder.search(query),
    queryFn: () => searchGrFinder(query),
    enabled: enabled && !!query.trim(),
  });
}

// ============ Media-based Search ============

async function searchGrFinderByMedia(
  mediaType: MediaType,
  mediaId: string,
  customQuery?: string
): Promise<GrFinderSearchResponse & { query: string }> {
  const endpoint =
    mediaType === "audiobook"
      ? `/api/gr-finder/search/audiobook/${mediaId}`
      : `/api/gr-finder/search/ebook/${mediaId}`;

  const searchParams = new URLSearchParams();
  if (customQuery) searchParams.set("q", customQuery);

  const url = `${endpoint}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Search failed");
  }

  return response.json();
}

export function useGrFinderSearchByMedia(
  mediaType: MediaType,
  mediaId: string,
  enabled: boolean = true,
  customQuery?: string
) {
  return useQuery({
    queryKey: queryKeys.grFinder.searchByMedia(mediaType, mediaId, customQuery),
    queryFn: () => searchGrFinderByMedia(mediaType, mediaId, customQuery),
    enabled: !!mediaId && enabled,
  });
}

// ============ Goodreads Link Hooks ============

async function fetchGoodreadsLink(
  mediaType: MediaType,
  mediaId: string
): Promise<GoodreadsLinkResponse> {
  const endpoint =
    mediaType === "audiobook"
      ? `/api/gr-finder/link/${mediaId}`
      : `/api/gr-finder/ebook-link/${mediaId}`;

  const response = await fetch(endpoint, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch Goodreads link");
  }

  return response.json();
}

export function useGoodreadsLink(mediaType: MediaType, mediaId: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.grFinder.link(mediaType, mediaId),
    queryFn: () => fetchGoodreadsLink(mediaType, mediaId),
    enabled: !!mediaId,
  });

  return {
    link: data?.link ?? null,
    isLoading,
    error,
    refetch,
  };
}

interface LinkMediaParams {
  mediaType: MediaType;
  mediaId: string;
  goodreadsId: string;
  /**
   * The search result the user picked. Sent so the backend can still complete
   * the link with real title/author/rating when the Goodreads book page itself
   * can't be scraped, instead of storing "Unknown" for everything.
   */
  searchResult?: GrFinderSearchResult;
}

async function linkMediaToGoodreads(
  params: LinkMediaParams
): Promise<{ queued: boolean; jobId: string }> {
  const endpoint =
    params.mediaType === "audiobook"
      ? `/api/gr-finder/link/${params.mediaId}`
      : `/api/gr-finder/ebook-link/${params.mediaId}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      goodreadsId: params.goodreadsId,
      // Only the fields the backend accepts — it rejects unknown properties.
      ...(params.searchResult
        ? {
            searchResult: {
              title: params.searchResult.title,
              author: params.searchResult.author,
              cover_url: params.searchResult.cover_url,
              avg_rating: params.searchResult.avg_rating,
            },
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to link media");
  }

  return response.json();
}

/**
 * Queues a Goodreads link. The request only enqueues — the link itself runs as
 * a background job shown in the sidebar, and the `audiobook.updated` /
 * `ebook.updated` WebSocket event it emits on completion is what refreshes the
 * media caches. Nothing to invalidate here yet.
 */
export function useGoodreadsLinkMedia() {
  const mutation = useMutation({
    mutationFn: linkMediaToGoodreads,
  });

  return {
    linkMedia: mutation.mutateAsync,
    isLinking: mutation.isPending,
    error: mutation.error,
  };
}

async function dismissGoodreadsLinkFailures(): Promise<void> {
  const response = await fetch("/api/gr-finder/link-jobs/failed", {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to dismiss link failures");
  }
}

export function useDismissGoodreadsLinkFailures() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: dismissGoodreadsLinkFailures,
    onSuccess: () => {
      // Clear just the failures — a job may still be running. The backend also
      // pushes fresh status over the socket right after this.
      queryClient.setQueryData<GoodreadsLinkStatus>(
        queryKeys.tasks.goodreadsLink(),
        (previous) =>
          previous ? { ...previous, failedCount: 0, failures: [] } : previous
      );
    },
  });

  return {
    dismissFailures: mutation.mutateAsync,
    isDismissing: mutation.isPending,
  };
}

interface UnlinkMediaParams {
  mediaType: MediaType;
  mediaId: string;
}

async function unlinkMediaFromGoodreads(params: UnlinkMediaParams): Promise<void> {
  const endpoint =
    params.mediaType === "audiobook"
      ? `/api/gr-finder/link/${params.mediaId}`
      : `/api/gr-finder/ebook-link/${params.mediaId}`;

  const response = await fetch(endpoint, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to unlink media");
  }
}

export function useGoodreadsUnlinkMedia() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: unlinkMediaFromGoodreads,
    onSuccess: (_, variables) => {
      // Invalidate the goodreads link query
      queryClient.invalidateQueries({
        queryKey: queryKeys.grFinder.link(variables.mediaType, variables.mediaId),
      });
      // Invalidate the audiobook/ebook list and detail
      if (variables.mediaType === "audiobook") {
        queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.detail(variables.mediaId) });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.detail(variables.mediaId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
    },
  });

  return {
    unlinkMedia: mutation.mutateAsync,
    isUnlinking: mutation.isPending,
    error: mutation.error,
  };
}
