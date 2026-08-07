import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface AudiobookBookmark {
  id: string;
  audiobookId: string;
  note: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkedAudiobook {
  audiobookId: string;
  audiobookTitle: string;
  authorName: string | null;
  coverUrl: string | null;
  bookmarkCount: number;
  latestBookmarkAt: string;
}

export interface BookmarkedAudiobooksResponse {
  items: BookmarkedAudiobook[];
  total: number;
}

interface CreateBookmarkInput {
  audiobookId: string;
  position: number;
  note?: string;
  /** Client-generated UUID; makes the create idempotent against retries. */
  id?: string;
}

interface UpdateBookmarkInput {
  audiobookId: string;
  bookmarkId: string;
  position?: number;
  /** An empty string clears the note. */
  note?: string;
}

interface DeleteBookmarkInput {
  audiobookId: string;
  bookmarkId: string;
}

async function fetchBookmarks(
  audiobookId: string,
): Promise<AudiobookBookmark[]> {
  const response = await fetch(`/api/audiobooks/${audiobookId}/bookmarks`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch bookmarks");
  return response.json();
}

async function fetchBookmarkedAudiobooks(
  userId: string,
  limit: number,
  offset: number,
): Promise<BookmarkedAudiobooksResponse> {
  const response = await fetch(
    `/api/user-profile/${userId}/bookmarked-audiobooks?limit=${limit}&offset=${offset}`,
    { credentials: "include" },
  );
  if (!response.ok) throw new Error("Failed to fetch bookmarked audiobooks");
  return response.json();
}

async function createBookmark({
  audiobookId,
  ...body
}: CreateBookmarkInput): Promise<AudiobookBookmark> {
  const response = await fetch(`/api/audiobooks/${audiobookId}/bookmarks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to create bookmark");
  return response.json();
}

async function updateBookmark({
  audiobookId,
  bookmarkId,
  ...body
}: UpdateBookmarkInput): Promise<AudiobookBookmark> {
  const response = await fetch(
    `/api/audiobooks/${audiobookId}/bookmarks/${bookmarkId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    },
  );
  if (!response.ok) throw new Error("Failed to update bookmark");
  return response.json();
}

async function deleteBookmark({
  audiobookId,
  bookmarkId,
}: DeleteBookmarkInput): Promise<void> {
  const response = await fetch(
    `/api/audiobooks/${audiobookId}/bookmarks/${bookmarkId}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  if (!response.ok) throw new Error("Failed to delete bookmark");
}

/**
 * Generate a client-side UUID for idempotent creates. Returns undefined when
 * the Web Crypto API is unavailable (plain-HTTP LAN installs) — the server
 * generates the id in that case.
 */
export function generateBookmarkId(): string | undefined {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return undefined;
}

export function useAudiobookBookmarks(audiobookId: string) {
  return useQuery<AudiobookBookmark[]>({
    queryKey: queryKeys.bookmarks.list(audiobookId),
    queryFn: () => fetchBookmarks(audiobookId),
    staleTime: 60 * 1000,
  });
}

/**
 * The audiobooks a user has bookmarks in, with per-book counts, most recent
 * bookmark activity first. The profile page links each row to the book's
 * detail page, where the individual bookmarks live.
 */
export function useBookmarkedAudiobooks(
  userId: string,
  offset: number,
  limit = 20,
) {
  return useQuery<BookmarkedAudiobooksResponse>({
    // Limit is part of the key: the profile card (5) and the full page (20)
    // both start at offset 0 and must not share a cache entry.
    queryKey: queryKeys.bookmarks.userBooks(userId, offset, limit),
    queryFn: () => fetchBookmarkedAudiobooks(userId, limit, offset),
    staleTime: 60 * 1000,
  });
}

export function useCreateBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createBookmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
    },
  });
}

export function useUpdateBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateBookmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
    },
  });
}

export function useDeleteBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteBookmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
    },
  });
}
