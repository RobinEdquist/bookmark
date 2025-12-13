"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "./query-keys";

export type MediaType = "audiobook" | "ebook";

interface HardcoverStatus {
  configured: boolean;
  autoSyncOnImport: boolean;
}

interface ValidateResponse {
  valid: boolean;
  error?: string;
}

// Hardcover API Types
export interface HardcoverImage {
  color?: string;
  color_name?: string;
  height?: number;
  id?: number;
  url?: string;
  width?: number;
}

export interface HardcoverAuthor {
  id: number;
  image?: HardcoverImage;
  name: string;
  slug: string;
}

export interface HardcoverContribution {
  author: HardcoverAuthor;
  contribution: string | null;
}

export interface HardcoverFeaturedSeries {
  name?: string;
  slug?: string;
  position?: number;
}

export interface HardcoverBookDocument {
  activities_count: number;
  alternative_titles: string[];
  author_names: string[];
  compilation: boolean;
  content_warnings: string[];
  contribution_types: string[];
  contributions: HardcoverContribution[];
  featured_series: HardcoverFeaturedSeries;
  genres: string[];
  has_audiobook: boolean;
  has_ebook: boolean;
  id: string;
  image: HardcoverImage;
  isbns: string[];
  lists_count: number;
  moods: string[];
  prompts_count: number;
  rating: number;
  ratings_count: number;
  reviews_count: number;
  series_names: string[];
  slug: string;
  tags: string[];
  title: string;
  users_count: number;
  users_read_count: number;
}

export interface HardcoverSearchHit {
  document: HardcoverBookDocument;
  text_match: number;
}

export interface HardcoverSearchResults {
  found: number;
  hits: HardcoverSearchHit[];
  out_of: number;
  page: number;
  search_time_ms: number;
}

export interface HardcoverSearchResponse {
  search: {
    results: HardcoverSearchResults;
  };
}

export interface HardcoverAudiobookSearchResponse extends HardcoverSearchResponse {
  query: string;
}

async function fetchStatus(): Promise<HardcoverStatus> {
  const response = await fetch("/api/hardcover/status", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Hardcover status");
  }
  return response.json();
}

async function validateApiKey(apiKey: string): Promise<ValidateResponse> {
  const response = await fetch("/api/hardcover/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ apiKey }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to validate API key");
  }

  return response.json();
}

async function disconnectApi(): Promise<void> {
  const response = await fetch("/api/hardcover/disconnect", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to disconnect");
  }
}

interface SearchParams {
  query: string;
  author?: string;
}

async function searchBooks(params: SearchParams): Promise<unknown> {
  const searchParams = new URLSearchParams({ q: params.query });
  if (params.author) {
    searchParams.set("author", params.author);
  }

  const response = await fetch(`/api/hardcover/search?${searchParams.toString()}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Search failed");
  }

  return response.json();
}

export function useHardcoverStatus() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.hardcover.status(),
    queryFn: fetchStatus,
  });

  return {
    isConfigured: data?.configured ?? false,
    autoSyncOnImport: data?.autoSyncOnImport ?? false,
    isLoading,
    error,
    refetch,
  };
}

export function useHardcoverConnect() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: validateApiKey,
    onSuccess: (result) => {
      if (result.valid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.hardcover.all });
      }
    },
  });

  return {
    connect: mutation.mutateAsync,
    isConnecting: mutation.isPending,
    error: mutation.error,
  };
}

export function useHardcoverDisconnect() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: disconnectApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hardcover.all });
    },
  });

  return {
    disconnect: mutation.mutateAsync,
    isDisconnecting: mutation.isPending,
    error: mutation.error,
  };
}

async function setAutoSyncOnImport(enabled: boolean): Promise<{ success: boolean; autoSyncOnImport: boolean }> {
  const response = await fetch("/api/hardcover/auto-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ enabled }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to update auto-sync setting");
  }

  return response.json();
}

export function useHardcoverAutoSync() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: setAutoSyncOnImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hardcover.all });
    },
  });

  return {
    setAutoSync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error,
  };
}

export function useHardcoverSearch() {
  const [searchResult, setSearchResult] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: searchBooks,
    onSuccess: (data) => {
      setSearchResult(data);
    },
  });

  return {
    search: mutation.mutateAsync,
    isSearching: mutation.isPending,
    error: mutation.error,
    searchResult,
    clearResult: () => setSearchResult(null),
  };
}

async function searchByAudiobookId(
  audiobookId: string
): Promise<HardcoverAudiobookSearchResponse> {
  const response = await fetch(`/api/hardcover/search/audiobook/${audiobookId}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Search failed");
  }

  return response.json();
}

export function useHardcoverSearchByAudiobook() {
  const [searchResult, setSearchResult] =
    useState<HardcoverAudiobookSearchResponse | null>(null);

  const mutation = useMutation({
    mutationFn: searchByAudiobookId,
    onSuccess: (data) => {
      setSearchResult(data);
    },
  });

  return {
    searchByAudiobook: mutation.mutateAsync,
    isSearching: mutation.isPending,
    error: mutation.error,
    searchResult,
    clearResult: () => setSearchResult(null),
  };
}

// Hardcover link types
export interface HardcoverLink {
  id: string;
  hardcoverId: string;
  slug: string;
  title: string;
  authorNames: string[];
  contentWarnings: string[];
  featuredSeriesName: string | null;
  featuredSeriesPosition: string | null;
  genres: string[];
  imageUrl: string | null;
  isbns: string[];
  moods: string[];
  rating: string | null;
  ratingsCount: number | null;
  tags: string[];
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface HardcoverLinkResponse {
  link: HardcoverLink | null;
}

async function fetchHardcoverLink(
  mediaType: MediaType,
  mediaId: string
): Promise<HardcoverLinkResponse> {
  const endpoint =
    mediaType === "audiobook"
      ? `/api/hardcover/link/${mediaId}`
      : `/api/hardcover/ebook-link/${mediaId}`;

  const response = await fetch(endpoint, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch Hardcover link");
  }

  return response.json();
}

export function useHardcoverLink(mediaType: MediaType, mediaId: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.hardcover.link(mediaType, mediaId),
    queryFn: () => fetchHardcoverLink(mediaType, mediaId),
    enabled: !!mediaId,
  });

  return {
    link: data?.link ?? null,
    isLoading,
    error,
    refetch,
  };
}

async function searchByMediaPaginated(
  mediaType: MediaType,
  mediaId: string,
  page: number,
  perPage: number,
  customQuery?: string
): Promise<HardcoverAudiobookSearchResponse> {
  const searchParams = new URLSearchParams();
  if (page) searchParams.set("page", String(page));
  if (perPage) searchParams.set("perPage", String(perPage));
  if (customQuery) searchParams.set("q", customQuery);

  const endpoint =
    mediaType === "audiobook"
      ? `/api/hardcover/search/audiobook/${mediaId}`
      : `/api/hardcover/search/ebook/${mediaId}`;

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

export function useHardcoverSearchPaginated(
  mediaType: MediaType,
  mediaId: string,
  page: number = 1,
  perPage: number = 10,
  enabled: boolean = true,
  customQuery?: string
) {
  return useQuery({
    queryKey: queryKeys.hardcover.search(mediaType, mediaId, page, customQuery),
    queryFn: () => searchByMediaPaginated(mediaType, mediaId, page, perPage, customQuery),
    enabled: !!mediaId && enabled,
  });
}

interface LinkMediaParams {
  mediaType: MediaType;
  mediaId: string;
  hardcoverBook: HardcoverBookDocument;
}

async function linkMediaToHardcover(
  params: LinkMediaParams
): Promise<{ success: boolean; link: HardcoverLink }> {
  const endpoint =
    params.mediaType === "audiobook"
      ? `/api/hardcover/link/${params.mediaId}`
      : `/api/hardcover/ebook-link/${params.mediaId}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ hardcoverBook: params.hardcoverBook }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to link media");
  }

  return response.json();
}

export function useHardcoverLinkMedia() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: linkMediaToHardcover,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.hardcover.link(variables.mediaType, variables.mediaId),
      });
    },
  });

  return {
    linkMedia: mutation.mutateAsync,
    isLinking: mutation.isPending,
    error: mutation.error,
  };
}

interface UnlinkMediaParams {
  mediaType: MediaType;
  mediaId: string;
}

async function unlinkMediaFromHardcover(params: UnlinkMediaParams): Promise<void> {
  const endpoint =
    params.mediaType === "audiobook"
      ? `/api/hardcover/link/${params.mediaId}`
      : `/api/hardcover/ebook-link/${params.mediaId}`;

  const response = await fetch(endpoint, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to unlink media");
  }
}

export function useHardcoverUnlinkMedia() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: unlinkMediaFromHardcover,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.hardcover.link(variables.mediaType, variables.mediaId),
      });
    },
  });

  return {
    unlinkMedia: mutation.mutateAsync,
    isUnlinking: mutation.isPending,
    error: mutation.error,
  };
}

// Legacy aliases - can be removed once components are updated
export function useHardcoverLinkAudiobook() {
  const { linkMedia, isLinking, error } = useHardcoverLinkMedia();
  return {
    linkAudiobook: (params: { audiobookId: string; hardcoverBook: HardcoverBookDocument }) =>
      linkMedia({ mediaType: "audiobook", mediaId: params.audiobookId, hardcoverBook: params.hardcoverBook }),
    isLinking,
    error,
  };
}

export function useHardcoverUnlinkAudiobook() {
  const { unlinkMedia, isUnlinking, error } = useHardcoverUnlinkMedia();
  return {
    unlinkAudiobook: (audiobookId: string) =>
      unlinkMedia({ mediaType: "audiobook", mediaId: audiobookId }),
    isUnlinking,
    error,
  };
}

// ============ Queue Status Types ============

export interface FailedSyncItem {
  id: string;
  audiobookId: string;
  errorMessage: string | null;
  createdAt: string;
  audiobook: {
    id: string;
    title: string;
    subtitle: string | null;
    coverUrl: string | null;
  } | null;
}

export interface QueueStatus {
  pendingCount: number;
  failedCount: number;
  failedItems: FailedSyncItem[];
}

async function fetchQueueStatus(): Promise<QueueStatus> {
  const response = await fetch("/api/hardcover/queue/status", {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch queue status");
  }

  return response.json();
}

export function useHardcoverQueueStatus() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.hardcover.queueStatus(),
    queryFn: fetchQueueStatus,
    staleTime: Infinity, // Data is pushed via WebSocket
  });

  return {
    pendingCount: data?.pendingCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    failedItems: data?.failedItems ?? [],
    isLoading,
    error,
    refetch,
  };
}

async function dismissFailedSyncItem(id: string): Promise<void> {
  const response = await fetch(`/api/hardcover/queue/failed/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to dismiss item");
  }
}

interface QueueAllUnlinkedResponse {
  queuedCount: number;
}

async function queueAllUnlinked(
  mediaType: MediaType
): Promise<QueueAllUnlinkedResponse> {
  const endpoint = `/api/hardcover/queue-all-unlinked/${mediaType}s`;

  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // Check if it's a "not configured" error (BadRequestException from backend)
    if (error.message && error.message.includes("Hardcover API key not configured")) {
      throw new Error("HARDCOVER_NOT_CONFIGURED");
    }
    throw new Error(error.message || "Failed to queue items");
  }

  return response.json();
}

export function useHardcoverDismissFailedItem() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: dismissFailedSyncItem,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.hardcover.queueStatus(),
      });
    },
  });

  return {
    dismissItem: mutation.mutateAsync,
    isDismissing: mutation.isPending,
    error: mutation.error,
  };
}

export function useQueueAllUnlinked() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: queueAllUnlinked,
    onSuccess: () => {
      // Invalidate queue status to reflect new pending count
      queryClient.invalidateQueries({
        queryKey: queryKeys.hardcover.queueStatus(),
      });
    },
  });

  return {
    queueAllUnlinked: mutation.mutateAsync,
    isQueueing: mutation.isPending,
    error: mutation.error,
  };
}
