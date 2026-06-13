"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

// ---------------------------------------------------------------------------
// Types — mirror CvVolumeRaw / CvIssueRaw / CachedVolume / CachedIssue / QueueItemDto
// from apps/backend/src/comicvine/dto/comicvine.dto.ts.
// Dates are typed as string because JSON serialises Date to ISO strings.
// ---------------------------------------------------------------------------

export interface ComicvineVolume {
  id: number;
  name: string;
  start_year?: number | string | null;
  publisher?: { name: string } | null;
  count_of_issues?: number | null;
  description?: string | null;
  image?: { medium_url?: string; original_url?: string } | null;
  site_detail_url?: string | null;
}

export interface ComicvineIssue {
  id: number;
  issue_number?: string | null;
  name?: string | null;
  cover_date?: string | null;
  store_date?: string | null;
  volume?: { id: number; name: string } | null;
  person_credits?: { name: string; role: string }[] | null;
  character_credits?: { name: string }[] | null;
  story_arc_credits?: { name: string }[] | null;
  description?: string | null;
  image?: { medium_url?: string; original_url?: string } | null;
  site_detail_url?: string | null;
}

/** CachedVolume shape over the wire (dates serialised to strings). */
export interface ComicvineSeriesLink {
  id: string;
  comicvineVolumeId: number;
  name: string;
  startYear: number | null;
  publisherName: string | null;
  countOfIssues: number | null;
  description: string | null;
  imageUrl: string | null;
  siteDetailUrl: string | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** CachedIssue shape over the wire (dates serialised to strings). */
export interface ComicvineBookLink {
  id: string;
  comicvineIssueId: number;
  comicvineVolumeId: number | null;
  issueNumber: string | null;
  name: string | null;
  coverDate: string | null;
  storeDate: string | null;
  description: string | null;
  imageUrl: string | null;
  siteDetailUrl: string | null;
  personCredits: { name: string; role: string }[];
  characterCredits: string[];
  storyArcCredits: string[];
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComicvineQueueItem {
  id: string;
  level: "series" | "book";
  seriesId: string | null;
  bookId: string | null;
  status: "pending" | "processing" | "failed" | "needs_review";
  errorMessage: string | null;
  createdAt: string;
  title: string | null;
}

// ---------------------------------------------------------------------------
// Issue shape bridge
// ---------------------------------------------------------------------------

/**
 * Bridge a cached/browsed issue (`ComicvineBookLink`, the shape the issue
 * BROWSE endpoints return) back into the raw ComicVine payload shape
 * (`ComicvineIssue`) that `POST /link/book/:bookId` expects.
 *
 * This is lossless: a `CachedIssue` row carries every field the backend's
 * `upsertIssue` reads, so a browsed issue can be linked directly without
 * re-fetching the raw issue from the ComicVine API. The volume name is not
 * stored on the cached row, so we send an empty string — `upsertIssue` only
 * persists `volume.id` as `comicvineVolumeId`.
 */
export function cachedIssueToRawPayload(
  issue: ComicvineBookLink
): ComicvineIssue {
  return {
    id: issue.comicvineIssueId,
    issue_number: issue.issueNumber,
    name: issue.name,
    cover_date: issue.coverDate,
    store_date: issue.storeDate,
    description: issue.description,
    site_detail_url: issue.siteDetailUrl,
    image: issue.imageUrl ? { original_url: issue.imageUrl } : null,
    person_credits: issue.personCredits ?? [],
    character_credits: (issue.characterCredits ?? []).map((name) => ({ name })),
    story_arc_credits: (issue.storyArcCredits ?? []).map((name) => ({ name })),
    volume: issue.comicvineVolumeId
      ? { id: issue.comicvineVolumeId, name: "" }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Internal response shapes
// ---------------------------------------------------------------------------

interface ComicvineStatusResponse {
  configured: boolean;
  autoSyncOnImport: boolean;
}

interface ValidateResponse {
  valid: boolean;
  error?: string;
}

interface SearchVolumesResponse {
  totalResults: number;
  results: ComicvineVolume[];
}

interface VolumeForSeriesResponse {
  totalResults: number;
  results: ComicvineVolume[];
  currentLink: ComicvineSeriesLink | null;
  query: string;
}

/**
 * The backend returns `issues` (not `results`) for volume-issues and
 * issue-for-book endpoints because they return CachedIssue rows.
 */
interface VolumeIssuesResponse {
  totalResults: number;
  issues: ComicvineBookLink[];
}

interface IssuesForBookResponse {
  totalResults: number;
  issues: ComicvineBookLink[];
  linkedVolume: boolean;
}

interface SeriesLinkResponse {
  link: ComicvineSeriesLink | null;
}

interface BookLinkResponse {
  link: ComicvineBookLink | null;
}

interface LinkSeriesResponse {
  success: true;
  link: ComicvineSeriesLink;
}

interface LinkBookResponse {
  success: true;
  link: ComicvineBookLink;
}

interface QueueStatusResponse {
  pendingCount: number;
  needsReviewCount: number;
  failedCount: number;
  items: ComicvineQueueItem[];
}

interface QueueAllUnlinkedResponse {
  queuedCount: number;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchComicvineStatus(): Promise<ComicvineStatusResponse> {
  const response = await fetch("/api/comicvine/status", {
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch ComicVine status");
  }
  return response.json();
}

async function validateApiKey(apiKey: string): Promise<ValidateResponse> {
  const response = await fetch("/api/comicvine/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ apiKey }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to validate API key");
  }
  return response.json();
}

async function disconnectComicvine(): Promise<{ success: true }> {
  const response = await fetch("/api/comicvine/disconnect", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to disconnect ComicVine");
  }
  return response.json();
}

async function setAutoSyncOnImport(
  enabled: boolean
): Promise<{ success: true; autoSyncOnImport: boolean }> {
  const response = await fetch("/api/comicvine/auto-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to update auto-sync setting");
  }
  return response.json();
}

async function fetchSearchVolumes(
  query: string,
  page: number
): Promise<SearchVolumesResponse> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  const response = await fetch(`/api/comicvine/search/volumes?${params}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to search ComicVine volumes");
  }
  return response.json();
}

async function fetchVolumeForSeries(
  seriesId: string,
  page: number
): Promise<VolumeForSeriesResponse> {
  const params = new URLSearchParams({ page: String(page) });
  const response = await fetch(
    `/api/comicvine/search/volume-for-series/${seriesId}?${params}`,
    { credentials: "include" }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch volume for series");
  }
  return response.json();
}

async function fetchVolumeIssues(
  cvVolumeId: number,
  page: number
): Promise<VolumeIssuesResponse> {
  const params = new URLSearchParams({ page: String(page) });
  const response = await fetch(
    `/api/comicvine/volume/${cvVolumeId}/issues?${params}`,
    { credentials: "include" }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch volume issues");
  }
  return response.json();
}

async function fetchIssuesForBook(
  bookId: string,
  page: number
): Promise<IssuesForBookResponse> {
  const params = new URLSearchParams({ page: String(page) });
  const response = await fetch(
    `/api/comicvine/search/issue-for-book/${bookId}?${params}`,
    { credentials: "include" }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch issues for book");
  }
  return response.json();
}

async function fetchSeriesLink(
  seriesId: string
): Promise<SeriesLinkResponse> {
  const response = await fetch(`/api/comicvine/link/series/${seriesId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch series ComicVine link");
  }
  return response.json();
}

async function fetchBookLink(bookId: string): Promise<BookLinkResponse> {
  const response = await fetch(`/api/comicvine/link/book/${bookId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch book ComicVine link");
  }
  return response.json();
}

async function linkSeries(
  seriesId: string,
  volume: ComicvineVolume
): Promise<LinkSeriesResponse> {
  const response = await fetch(`/api/comicvine/link/series/${seriesId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ volume }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to link series to ComicVine volume");
  }
  return response.json();
}

async function unlinkSeries(seriesId: string): Promise<void> {
  const response = await fetch(`/api/comicvine/link/series/${seriesId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to unlink series from ComicVine");
  }
}

async function linkBook(
  bookId: string,
  issue: ComicvineIssue
): Promise<LinkBookResponse> {
  const response = await fetch(`/api/comicvine/link/book/${bookId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ issue }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to link book to ComicVine issue");
  }
  return response.json();
}

async function unlinkBook(bookId: string): Promise<void> {
  const response = await fetch(`/api/comicvine/link/book/${bookId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to unlink book from ComicVine");
  }
}

async function fetchQueueStatus(): Promise<QueueStatusResponse> {
  const response = await fetch("/api/comicvine/queue/status", {
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch ComicVine queue status");
  }
  return response.json();
}

async function dismissQueueItem(id: string): Promise<void> {
  const response = await fetch(`/api/comicvine/queue/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to dismiss queue item");
  }
}

async function queueAllUnlinkedSeries(): Promise<QueueAllUnlinkedResponse> {
  const response = await fetch("/api/comicvine/queue-all-unlinked/series", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (
      err.message &&
      err.message.includes("ComicVine API key not configured")
    ) {
      throw new Error("COMICVINE_NOT_CONFIGURED");
    }
    throw new Error(err.message || "Failed to queue unlinked series");
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useComicvineStatus() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.comicvine.status(),
    queryFn: fetchComicvineStatus,
  });

  return {
    isConfigured: data?.configured ?? false,
    autoSyncOnImport: data?.autoSyncOnImport ?? false,
    isLoading,
    error,
    refetch,
  };
}

export function useComicvineConnect() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: validateApiKey,
    onSuccess: (result) => {
      if (result.valid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.comicvine.all });
      }
    },
  });

  return {
    connect: mutation.mutateAsync,
    isConnecting: mutation.isPending,
    error: mutation.error,
  };
}

export function useComicvineDisconnect() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: disconnectComicvine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comicvine.all });
    },
  });

  return {
    disconnect: mutation.mutateAsync,
    isDisconnecting: mutation.isPending,
    error: mutation.error,
  };
}

export function useComicvineAutoSync() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: setAutoSyncOnImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comicvine.all });
    },
  });

  return {
    setAutoSync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error,
  };
}

export function useComicvineSearchVolumes(
  query: string,
  page = 1,
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.comicvine.searchVolumes(query, page),
    queryFn: () => fetchSearchVolumes(query, page),
    enabled: enabled && !!query,
  });
}

export function useComicvineVolumeForSeries(
  seriesId: string,
  page = 1,
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.comicvine.volumeForSeries(seriesId, page),
    queryFn: () => fetchVolumeForSeries(seriesId, page),
    enabled: enabled && !!seriesId,
  });
}

export function useComicvineVolumeIssues(
  cvVolumeId: number,
  page = 1,
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.comicvine.volumeIssues(cvVolumeId, page),
    queryFn: () => fetchVolumeIssues(cvVolumeId, page),
    enabled: enabled && cvVolumeId > 0,
  });
}

export function useComicvineIssuesForBook(
  bookId: string,
  page = 1,
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.comicvine.issuesForBook(bookId, page),
    queryFn: () => fetchIssuesForBook(bookId, page),
    enabled: enabled && !!bookId,
  });
}

export function useComicvineSeriesLink(seriesId: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.comicvine.seriesLink(seriesId),
    queryFn: () => fetchSeriesLink(seriesId),
    enabled: !!seriesId,
  });

  return {
    link: data?.link ?? null,
    isLoading,
    error,
    refetch,
  };
}

export function useLinkSeriesToVolume() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      seriesId,
      volume,
    }: {
      seriesId: string;
      volume: ComicvineVolume;
    }) => linkSeries(seriesId, volume),
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comicvine.seriesLink(seriesId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.comics.seriesDetail(seriesId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
    },
  });

  return {
    linkSeries: mutation.mutateAsync,
    isLinking: mutation.isPending,
    error: mutation.error,
  };
}

export function useUnlinkSeries() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ seriesId }: { seriesId: string }) => unlinkSeries(seriesId),
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comicvine.seriesLink(seriesId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.comics.seriesDetail(seriesId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
    },
  });

  return {
    unlinkSeries: mutation.mutateAsync,
    isUnlinking: mutation.isPending,
    error: mutation.error,
  };
}

export function useComicvineBookLink(bookId: string) {
  return useQuery({
    queryKey: queryKeys.comicvine.bookLink(bookId),
    queryFn: () => fetchBookLink(bookId),
    enabled: !!bookId,
  });
}

export function useLinkBookToIssue() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    // Accepts a browsed issue (the cached browse-list item). The issue BROWSE
    // endpoints return ComicvineBookLink, while the link endpoint expects the
    // raw ComicvineIssue payload — so bridge here, keeping the UI mapping-free.
    mutationFn: ({
      bookId,
      issue,
    }: {
      bookId: string;
      issue: ComicvineBookLink;
    }) => linkBook(bookId, cachedIssueToRawPayload(issue)),
    onSuccess: (_, { bookId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comicvine.bookLink(bookId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.comics.bookDetail(bookId),
      });
    },
  });

  return {
    linkBook: mutation.mutateAsync,
    isLinking: mutation.isPending,
    error: mutation.error,
  };
}

export function useUnlinkBook() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ bookId }: { bookId: string }) => unlinkBook(bookId),
    onSuccess: (_, { bookId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comicvine.bookLink(bookId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.comics.bookDetail(bookId),
      });
    },
  });

  return {
    unlinkBook: mutation.mutateAsync,
    isUnlinking: mutation.isPending,
    error: mutation.error,
  };
}

export function useComicvineQueueStatus() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.comicvine.queueStatus(),
    queryFn: fetchQueueStatus,
    staleTime: Infinity, // Data is pushed via WebSocket
  });

  return {
    pendingCount: data?.pendingCount ?? 0,
    needsReviewCount: data?.needsReviewCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    items: data?.items ?? [],
    isLoading,
    error,
    refetch,
  };
}

export function useComicvineDismiss() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: dismissQueueItem,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comicvine.queueStatus(),
      });
    },
  });

  return {
    dismissItem: mutation.mutateAsync,
    isDismissing: mutation.isPending,
    error: mutation.error,
  };
}

export function useQueueAllUnlinkedSeries() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: queueAllUnlinkedSeries,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comicvine.queueStatus(),
      });
    },
  });

  return {
    queueAllUnlinkedSeries: mutation.mutateAsync,
    isQueueing: mutation.isPending,
    error: mutation.error,
  };
}
