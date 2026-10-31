"use client";

import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export type ReadingListMediaType = "audiobook" | "ebook" | "comic";
export type ReadStatus = "unread" | "in_progress" | "finished";

export interface ReadingListListItem {
  id: string;
  mediaType: ReadingListMediaType;
  name: string;
  description: string | null;
  entryCount: number;
  coverUrl: string | null;
  updatedAt: string;
}

export interface ReadingListEntry {
  /** Names the entry in moves and removals: the item id, or the entry id while missing. */
  id: string;
  /** Null while the library does not have the item. */
  itemId: string | null;
  missing: boolean;
  position: number;
  note: string | null;
  /** Comics: "Series #n". Books: the title. */
  title: string;
  /** Comics: the issue title. Books: the authors. */
  subtitle: string | null;
  coverUrl: string | null;
  seriesId: string | null;
  seriesTitle: string | null;
  number: string | null;
  readStatus: ReadStatus;
}

export interface ReadingListDetail {
  id: string;
  mediaType: ReadingListMediaType;
  name: string;
  sortName: string | null;
  description: string | null;
  coverUrl: string | null;
  entries: ReadingListEntry[];
  finishedCount: number;
  missingCount: number;
}

export interface ReadingListFilters {
  mediaType?: ReadingListMediaType;
  search?: string;
  itemId?: string;
}

const PER_PAGE = 50;

function buildParams(
  f: ReadingListFilters & { limit?: number; offset?: number },
): URLSearchParams {
  const p = new URLSearchParams();
  if (f.mediaType) p.set("mediaType", f.mediaType);
  if (f.search) p.set("search", f.search);
  if (f.itemId) p.set("itemId", f.itemId);
  if (f.limit != null) p.set("limit", String(f.limit));
  if (f.offset != null) p.set("offset", String(f.offset));
  return p;
}

async function fetchReadingLists(
  f: ReadingListFilters & { limit?: number; offset?: number },
): Promise<{ readingLists: ReadingListListItem[]; total: number }> {
  const r = await fetch(`/api/reading-lists?${buildParams(f)}`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error("Failed to fetch reading lists");
  return r.json();
}

export function useInfiniteReadingLists(f: ReadingListFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.readingLists.list(f),
    queryFn: ({ pageParam = 0 }) =>
      fetchReadingLists({ ...f, limit: PER_PAGE, offset: pageParam }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((a, p) => a + p.readingLists.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    initialPageParam: 0,
    placeholderData: (prev) => prev,
    gcTime: 30 * 60 * 1000,
  });
}

/** The reading lists that hold one item. */
export function useReadingListsForItem(
  mediaType: ReadingListMediaType,
  itemId: string,
) {
  return useQuery({
    queryKey: queryKeys.readingLists.forItem(itemId),
    queryFn: async () =>
      (await fetchReadingLists({ mediaType, itemId, limit: 100 })).readingLists,
    enabled: !!itemId,
  });
}

export function useReadingList(id: string) {
  return useQuery({
    queryKey: queryKeys.readingLists.detail(id),
    queryFn: async (): Promise<ReadingListDetail> => {
      const r = await fetch(`/api/reading-lists/${id}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to fetch reading list");
      return r.json();
    },
    enabled: !!id,
  });
}

async function send<T>(
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${url} failed`);
  return r.status === 204 ? (undefined as T) : r.json();
}

/** Every reading list mutation refreshes all reading list queries. */
function useReadingListMutation<TVars, TResult>(
  mutationFn: (vars: TVars) => Promise<TResult>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.readingLists.all }),
  });
}

export function useCreateReadingList() {
  return useReadingListMutation(
    (input: {
      mediaType: ReadingListMediaType;
      name: string;
      description?: string | null;
    }) => send<{ id: string }>("POST", "/api/reading-lists", input),
  );
}

export function useUpdateReadingList() {
  return useReadingListMutation(
    ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; description?: string | null };
    }) => send<{ success: boolean }>("PATCH", `/api/reading-lists/${id}`, data),
  );
}

export function useDeleteReadingList() {
  return useReadingListMutation((id: string) =>
    send<void>("DELETE", `/api/reading-lists/${id}`),
  );
}

export function useAddToReadingList() {
  return useReadingListMutation(
    ({ id, itemIds }: { id: string; itemIds: string[] }) =>
      send<{ added: number; alreadyIn: number; entryCount: number }>(
        "POST",
        `/api/reading-lists/${id}/items`,
        { itemIds },
      ),
  );
}

export function useRemoveFromReadingList() {
  return useReadingListMutation(
    ({ id, itemId }: { id: string; itemId: string }) =>
      send<{ success: boolean }>(
        "DELETE",
        `/api/reading-lists/${id}/items/${itemId}`,
      ),
  );
}

/** Moves one item to a 0-based place in the whole list. */
export function useMoveReadingListItem() {
  return useReadingListMutation(
    ({
      id,
      itemId,
      position,
    }: {
      id: string;
      itemId: string;
      position: number;
    }) =>
      send<{ success: boolean }>(
        "PATCH",
        `/api/reading-lists/${id}/items/${itemId}`,
        { position },
      ),
  );
}

export function useSetReadingListNote() {
  return useReadingListMutation(
    ({
      id,
      itemId,
      note,
    }: {
      id: string;
      itemId: string;
      note: string | null;
    }) =>
      send<{ success: boolean }>(
        "PATCH",
        `/api/reading-lists/${id}/items/${itemId}`,
        { note },
      ),
  );
}
