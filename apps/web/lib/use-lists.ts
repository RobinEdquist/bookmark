"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface List {
  id: string;
  name: string;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListItemAudiobook {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  duration: number | null;
  status: "available" | "missing" | "importing" | "hidden";
  authors: string[];
}

export interface ListItemEbook {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  status: "available" | "missing" | "importing" | "hidden";
  authors: string[];
}

export interface ListItem {
  id: string;
  listId: string;
  itemType: "audiobook" | "ebook";
  audiobookId: string | null;
  ebookId: string | null;
  order: number;
  createdAt: string;
  audiobook: ListItemAudiobook | null;
  ebook: ListItemEbook | null;
}

export interface ListDetail extends List {
  userId: string;
  items: ListItem[];
  isOwner: boolean;
}

export interface ListForItem {
  id: string;
  name: string;
  isPublic: boolean;
  itemCount: number;
  containsItem: boolean;
  listItemId: string | null;
}

// Fetch functions
async function fetchLists(): Promise<List[]> {
  const response = await fetch("/api/lists", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch lists");
  }

  return response.json();
}

async function fetchList(id: string): Promise<ListDetail> {
  const response = await fetch(`/api/lists/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("List not found");
    }
    if (response.status === 403) {
      throw new Error("Access denied");
    }
    throw new Error("Failed to fetch list");
  }

  return response.json();
}

async function fetchListsForItem(
  itemType: "audiobook" | "ebook",
  itemId: string
): Promise<ListForItem[]> {
  const params = new URLSearchParams({
    itemType,
    itemId,
  });

  const response = await fetch(`/api/lists/for-item?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch lists for item");
  }

  return response.json();
}

async function createList(data: {
  name: string;
  isPublic?: boolean;
}): Promise<List> {
  const response = await fetch("/api/lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to create list");
  }

  return response.json();
}

async function updateList(
  id: string,
  data: { name?: string; isPublic?: boolean }
): Promise<List> {
  const response = await fetch(`/api/lists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update list");
  }

  return response.json();
}

async function deleteList(id: string): Promise<void> {
  const response = await fetch(`/api/lists/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to delete list");
  }
}

async function addToList(data: {
  listId: string;
  itemType: "audiobook" | "ebook";
  itemId: string;
}): Promise<ListItem> {
  const response = await fetch(`/api/lists/${data.listId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      itemType: data.itemType,
      itemId: data.itemId,
    }),
  });

  if (!response.ok) {
    if (response.status === 409) {
      throw new Error("Item already in list");
    }
    throw new Error("Failed to add to list");
  }

  return response.json();
}

async function removeFromList(data: {
  listId: string;
  itemId: string;
}): Promise<void> {
  const response = await fetch(
    `/api/lists/${data.listId}/items/${data.itemId}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to remove from list");
  }
}

async function reorderListItems(data: {
  listId: string;
  itemIds: string[];
}): Promise<void> {
  const response = await fetch(`/api/lists/${data.listId}/items/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ itemIds: data.itemIds }),
  });

  if (!response.ok) {
    throw new Error("Failed to reorder items");
  }
}

// Hooks
export function useLists() {
  return useQuery({
    queryKey: queryKeys.lists.list(),
    queryFn: fetchLists,
  });
}

export function useList(id: string) {
  return useQuery({
    queryKey: queryKeys.lists.detail(id),
    queryFn: () => fetchList(id),
    enabled: !!id,
  });
}

export function useListsForItem(
  itemType: "audiobook" | "ebook",
  itemId: string
) {
  return useQuery({
    queryKey: queryKeys.lists.forItem(itemType, itemId),
    queryFn: () => fetchListsForItem(itemType, itemId),
    enabled: !!itemId,
  });
}

export function useCreateList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createList,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
    },
  });
}

export function useUpdateList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; isPublic?: boolean }) =>
      updateList(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.list() });
    },
  });
}

export function useDeleteList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteList,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
    },
  });
}

export function useAddToList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addToList,
    onSuccess: (_, { listId, itemType, itemId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.detail(listId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.list() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.lists.forItem(itemType, itemId),
      });
    },
  });
}

export function useRemoveFromList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeFromList,
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.detail(listId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.list() });
      // Also invalidate forItem queries since containsItem may have changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.lists.all,
        predicate: (query) => query.queryKey[1] === "for-item",
      });
    },
  });
}

export function useReorderListItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reorderListItems,
    onMutate: async ({ listId, itemIds }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.lists.detail(listId) });

      // Snapshot the previous value
      const previousList = queryClient.getQueryData<ListDetail>(
        queryKeys.lists.detail(listId)
      );

      // Optimistically update
      if (previousList) {
        const reorderedItems = itemIds
          .map((id, index) => {
            const item = previousList.items.find((i) => i.id === id);
            return item ? { ...item, order: index } : null;
          })
          .filter((item): item is ListItem => item !== null);

        queryClient.setQueryData<ListDetail>(queryKeys.lists.detail(listId), {
          ...previousList,
          items: reorderedItems,
        });
      }

      return { previousList };
    },
    onError: (_, { listId }, context) => {
      // Rollback on error
      if (context?.previousList) {
        queryClient.setQueryData(
          queryKeys.lists.detail(listId),
          context.previousList
        );
      }
    },
    onSettled: (_, __, { listId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.detail(listId) });
    },
  });
}
