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

export interface UserBookmark extends AudiobookBookmark {
  audiobookTitle: string;
  authorName: string | null;
  coverUrl: string | null;
}

export interface UserBookmarksResponse {
  items: UserBookmark[];
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

async function fetchUserBookmarks(
  userId: string,
  limit: number,
  offset: number,
): Promise<UserBookmarksResponse> {
  const response = await fetch(
    `/api/user-profile/${userId}/bookmarks?limit=${limit}&offset=${offset}`,
    { credentials: "include" },
  );
  if (!response.ok) throw new Error("Failed to fetch bookmarks");
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

export function useUserBookmarks(userId: string, offset: number, limit = 20) {
  return useQuery<UserBookmarksResponse>({
    queryKey: queryKeys.bookmarks.user(userId, offset),
    queryFn: () => fetchUserBookmarks(userId, limit, offset),
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
