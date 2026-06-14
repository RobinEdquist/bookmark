"use client";

import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export type ComicStatus = "available" | "missing" | "importing" | "hidden";
export type ComicBookFormat =
  | "single_issue"
  | "annual"
  | "tpb"
  | "omnibus"
  | "compendium"
  | "one_shot"
  | "special"
  | "graphic_novel"
  | "other";
export type ComicCreatorRole =
  | "writer"
  | "penciller"
  | "inker"
  | "colorist"
  | "letterer"
  | "cover_artist"
  | "editor"
  | "other";
export type ComicContainer = "cbz" | "cbr" | "pdf";

export interface ComicSeriesListItem {
  id: string;
  title: string;
  publisher: string | null;
  startYear: number | null;
  status: ComicStatus;
  bookCount: number;
  totalIssueCount: number | null;
  coverUrl: string | null;
  createdAt: string;
  comicvineLinked: boolean;
}

export interface ComicNamedRef {
  id: string;
  name: string;
}
export interface ComicCreatorRef {
  personId: string;
  name: string;
  role: ComicCreatorRole;
}

export interface ComicBookListItem {
  id: string;
  seriesId: string;
  title: string | null;
  number: string | null;
  sortNumber: number | null;
  format: ComicBookFormat;
  coverDate: string | null;
  pageCount: number | null;
  fileName: string;
  sizeBytes: number;
  container: ComicContainer;
  status: ComicStatus;
  collects: string | null;
  coverUrl: string | null;
}

export interface ComicSeriesDetail {
  id: string;
  title: string;
  sortTitle: string | null;
  description: string | null;
  publisher: string | null;
  imprint: string | null;
  startYear: number | null;
  totalIssueCount: number | null;
  language: string | null;
  ageRating: string | null;
  status: ComicStatus;
  folderPath: string;
  manualFields: string[];
  coverUrl: string | null;
  genres: ComicNamedRef[];
  tags: ComicNamedRef[];
  creators: ComicCreatorRef[];
  books: ComicBookListItem[];
  gaps: string[];
  publishedTotal: number | null;
  unownedPublished: string[];
  aggregatedTags: {
    storyArcs: string[];
    characters: string[];
  };
  createdAt: string;
  updatedAt: string;
  comicvine: {
    linked: boolean;
    volumeId: number | null;
    name: string | null;
    siteDetailUrl: string | null;
    imageUrl: string | null;
  };
}

export interface ComicBookDetail extends ComicBookListItem {
  summary: string | null;
  storeDate: string | null;
  filePath: string;
  manualFields: string[];
  web: string | null;
  ageRating: string | null;
  issueCountFromFile: number | null;
  metadataTags: {
    storyArcs: string[];
    characters: string[];
    teams: string[];
    locations: string[];
  };
  series: { id: string; title: string };
  creators: (ComicCreatorRef & { order: number })[];
  createdAt: string;
  updatedAt: string;
  comicvine: {
    linked: boolean;
    issueId: number | null;
    name: string | null;
    issueNumber: string | null;
    siteDetailUrl: string | null;
    imageUrl: string | null;
    suggestedCreators: { name: string; role: string }[];
  };
}

export interface ComicSeriesFilters {
  search?: string;
  publisher?: string;
  genreId?: string;
  metadataTag?: string;
  sortBy?: "title" | "recentlyAdded" | "startYear";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface UpdateComicSeriesInput {
  title?: string;
  sortTitle?: string | null;
  description?: string | null;
  publisher?: string | null;
  imprint?: string | null;
  startYear?: number | null;
  totalIssueCount?: number | null;
  language?: string | null;
  ageRating?: string | null;
  genres?: string[];
  tags?: string[];
}

export interface UpdateComicBookInput {
  title?: string | null;
  number?: string | null;
  format?: ComicBookFormat;
  coverDate?: string | null;
  summary?: string | null;
  collects?: string | null;
  creators?: { name: string; role: ComicCreatorRole }[];
}

const ITEMS_PER_PAGE = 50;

function buildSeriesParams(filters: ComicSeriesFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.publisher) params.set("publisher", filters.publisher);
  if (filters.genreId) params.set("genreId", filters.genreId);
  if (filters.metadataTag) params.set("metadataTag", filters.metadataTag);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  if (filters.limit != null) params.set("limit", filters.limit.toString());
  if (filters.offset != null) params.set("offset", filters.offset.toString());
  return params;
}

async function fetchComicSeries(
  filters: ComicSeriesFilters = {}
): Promise<{ series: ComicSeriesListItem[]; total: number }> {
  const response = await fetch(
    `/api/comics/series?${buildSeriesParams(filters)}`,
    { credentials: "include" }
  );
  if (!response.ok) {
    throw new Error("Failed to fetch comic series");
  }
  return response.json();
}

export function useComicSeries(filters: ComicSeriesFilters = {}) {
  return useQuery({
    queryKey: queryKeys.comics.list(filters),
    queryFn: () => fetchComicSeries(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useInfiniteComicSeries(
  filters: Omit<ComicSeriesFilters, "limit" | "offset"> = {}
) {
  return useInfiniteQuery({
    queryKey: queryKeys.comics.infinite(filters),
    queryFn: ({ pageParam = 0 }) =>
      fetchComicSeries({ ...filters, limit: ITEMS_PER_PAGE, offset: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, page) => acc + page.series.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    initialPageParam: 0,
    placeholderData: (previousData) => previousData,
  });
}

async function fetchComicSeriesDetail(id: string): Promise<ComicSeriesDetail> {
  const response = await fetch(`/api/comics/series/${id}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch comic series");
  }
  return response.json();
}

export function useComicSeriesDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.comics.seriesDetail(id),
    queryFn: () => fetchComicSeriesDetail(id),
    enabled: !!id,
  });
}

async function fetchComicBook(id: string): Promise<ComicBookDetail> {
  const response = await fetch(`/api/comics/books/${id}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch comic book");
  }
  return response.json();
}

export function useComicBook(id: string) {
  return useQuery({
    queryKey: queryKeys.comics.bookDetail(id),
    queryFn: () => fetchComicBook(id),
    enabled: !!id,
  });
}

async function updateComicSeries(
  id: string,
  data: UpdateComicSeriesInput
): Promise<{ success: boolean }> {
  const response = await fetch(`/api/comics/series/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to update comic series");
  }
  return response.json();
}

export function useUpdateComicSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateComicSeriesInput }) =>
      updateComicSeries(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.comics.seriesDetail(id),
      });
      // Invalidate lists in case they surface comic series metadata
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
    },
  });
}

async function updateComicBook(
  id: string,
  data: UpdateComicBookInput
): Promise<{ success: boolean }> {
  const response = await fetch(`/api/comics/books/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to update comic book");
  }
  return response.json();
}

export function useUpdateComicBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateComicBookInput }) =>
      updateComicBook(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.comics.bookDetail(id),
      });
    },
  });
}

export interface UpdateComicBooksBatchInput {
  ids: string[];
  data: {
    format?: ComicBookFormat;
    ageRating?: string | null;
  };
}

async function updateComicBooksBatch(
  input: UpdateComicBooksBatchInput
): Promise<{ updated: number }> {
  const response = await fetch("/api/comics/books/batch", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Failed to batch update comic books");
  }
  return response.json();
}

export function useUpdateComicBooksBatch(seriesId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateComicBooksBatchInput) =>
      updateComicBooksBatch(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comics.seriesDetail(seriesId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
    },
  });
}

async function deleteComicSeries(
  id: string,
  deleteFiles: boolean
): Promise<void> {
  const params = new URLSearchParams();
  params.set("deleteFiles", String(deleteFiles));

  const response = await fetch(`/api/comics/series/${id}?${params}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to delete comic series");
  }
}

export function useDeleteComicSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) =>
      deleteComicSeries(id, deleteFiles),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
      queryClient.removeQueries({
        queryKey: queryKeys.comics.seriesDetail(id),
      });
      // Invalidate lists in case they contain this series
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
    },
  });
}

async function deleteComicBook(
  id: string,
  deleteFiles: boolean
): Promise<void> {
  const params = new URLSearchParams();
  params.set("deleteFiles", String(deleteFiles));

  const response = await fetch(`/api/comics/books/${id}?${params}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to delete comic book");
  }
}

export function useDeleteComicBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) =>
      deleteComicBook(id, deleteFiles),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
      queryClient.removeQueries({ queryKey: queryKeys.comics.bookDetail(id) });
    },
  });
}

async function triggerComicRescanApi(): Promise<{
  success: boolean;
  result: { total: number; succeeded: number; failed: number };
}> {
  const response = await fetch(
    "/api/admin/library-watcher/rescan-comics",
    {
      method: "POST",
      credentials: "include",
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string }).message ||
        "Failed to trigger comic metadata rescan"
    );
  }

  return response.json();
}

export function useRescanComics() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: triggerComicRescanApi,
    onSuccess: () => {
      // Refresh comic series and book lists
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
    },
  });

  return {
    rescanComics: mutation.mutateAsync,
    isRescanComicsPending: mutation.isPending,
    rescanComicsError: mutation.error,
  };
}

async function moveComicBooks(input: {
  bookIds: string[];
  targetSeriesId: string;
}): Promise<{ moved: number; deletedSeriesIds: string[] }> {
  const response = await fetch("/api/comics/books/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Failed to move comic books");
  }
  return response.json();
}

export function useMoveComicBooks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: moveComicBooks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
    },
  });
}

async function mergeComicSeries(input: {
  sourceSeriesIds: string[];
  targetSeriesId: string;
}): Promise<{ moved: number; deletedSeriesIds: string[] }> {
  const response = await fetch("/api/comics/series/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Failed to merge comic series");
  }
  return response.json();
}

export function useMergeComicSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mergeComicSeries,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
    },
  });
}

async function createComicSeries(input: {
  title: string;
  publisher?: string | null;
  startYear?: number | null;
}): Promise<{ id: string }> {
  const response = await fetch("/api/comics/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Failed to create comic series");
  }
  return response.json();
}

export function useCreateComicSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createComicSeries,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comics.all });
    },
  });
}

export function useComicPublishers(search?: string) {
  return useQuery({
    queryKey: queryKeys.comics.publishers(search),
    queryFn: async (): Promise<string[]> => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      const response = await fetch(`/api/comics/publishers?${p}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch publishers");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useComicGenres(search?: string) {
  return useQuery({
    queryKey: queryKeys.comics.genres(search),
    queryFn: async (): Promise<ComicNamedRef[]> => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      const response = await fetch(`/api/comics/genres?${p}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch genres");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
