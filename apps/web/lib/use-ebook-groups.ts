"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface EbookGroupMember {
  id: string;
  title: string;
  coverUrl: string | null;
  role: string | null;
  position: number;
  status: string;
  authors: string[];
}

export interface EbookGroupListItem {
  id: string;
  name: string;
  ebookCount: number;
  coverUrl: string | null;
  createdAt: string;
}

export interface EbookGroupDetail {
  id: string;
  name: string;
  sortName: string | null;
  description: string | null;
  coverUrl: string | null;
  hasOwnCover: boolean;
  ebooks: EbookGroupMember[];
}

export interface EbookDetailGroup {
  id: string;
  name: string;
  role: string | null;
  members: EbookGroupMember[];
}

export interface EbookGroupFilters {
  search?: string;
  sortBy?: "name" | "recentlyAdded";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

const PER_PAGE = 50;

function buildParams(filters: EbookGroupFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  if (filters.limit != null) params.set("limit", String(filters.limit));
  if (filters.offset != null) params.set("offset", String(filters.offset));
  return params;
}

async function send<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function invalidateEbooks(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
}

export function useInfiniteEbookGroups(
  filters: Omit<EbookGroupFilters, "limit" | "offset"> = {},
) {
  return useInfiniteQuery({
    queryKey: queryKeys.ebooks.groups(filters),
    queryFn: ({ pageParam = 0 }) =>
      send<{ groups: EbookGroupListItem[]; total: number }>(
        `/api/ebooks/groups?${buildParams({
          ...filters,
          limit: PER_PAGE,
          offset: pageParam,
        })}`,
      ),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((sum, page) => sum + page.groups.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    initialPageParam: 0,
    placeholderData: (previous) => previous,
    gcTime: 30 * 60 * 1000,
  });
}

export function useEbookGroup(id: string) {
  return useQuery({
    queryKey: queryKeys.ebooks.groupDetail(id),
    queryFn: () => send<EbookGroupDetail>(`/api/ebooks/groups/${id}`),
    enabled: !!id,
  });
}

export function useCreateEbookGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      sortName?: string | null;
      description?: string | null;
    }) =>
      send<{ id: string }>("/api/ebooks/groups", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateEbooks(queryClient),
  });
}

export function useUpdateEbookGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        sortName?: string | null;
        description?: string | null;
      };
    }) =>
      send<{ success: boolean }>(`/api/ebooks/groups/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateEbooks(queryClient),
  });
}

export function useDeleteEbookGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      send<void>(`/api/ebooks/groups/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateEbooks(queryClient),
  });
}

export function useAddEbookToGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      ebookId,
      role,
    }: {
      groupId: string;
      ebookId: string;
      role?: string | null;
    }) =>
      send<{ success: boolean }>(`/api/ebooks/groups/${groupId}/ebooks`, {
        method: "POST",
        body: JSON.stringify({
          ebookId,
          ...(role !== undefined ? { role } : {}),
        }),
      }),
    onSuccess: () => invalidateEbooks(queryClient),
  });
}

export function useUpdateEbookGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      ebookId,
      role,
    }: {
      groupId: string;
      ebookId: string;
      role: string | null;
    }) =>
      send<{ success: boolean }>(
        `/api/ebooks/groups/${groupId}/ebooks/${ebookId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ role }),
        },
      ),
    onSuccess: () => invalidateEbooks(queryClient),
  });
}

export function useRemoveEbookFromGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ebookId }: { groupId: string; ebookId: string }) =>
      send<{ success: boolean }>(
        `/api/ebooks/groups/${groupId}/ebooks/${ebookId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => invalidateEbooks(queryClient),
  });
}

export function useReorderEbookGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      ebookIds,
    }: {
      groupId: string;
      ebookIds: string[];
    }) =>
      send<{ success: boolean }>(`/api/ebooks/groups/${groupId}/order`, {
        method: "PATCH",
        body: JSON.stringify({ ebookIds }),
      }),
    onSuccess: () => invalidateEbooks(queryClient),
  });
}

export function useClearEbookGroupCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      send<{ success: boolean }>(`/api/ebooks/groups/${id}/cover`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateEbooks(queryClient),
  });
}
