"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface AdminGenre {
  id: string;
  name: string;
  audiobookCount: number;
  ebookCount: number;
}

export interface RenameConflict {
  conflict: true;
  existingGenre: { id: string; name: string };
  sourceGenre: { id: string; name: string };
  audiobookCount: number;
  ebookCount: number;
}

export interface MergeResult {
  id: string;
  name: string;
  audiobooksMerged: number;
  ebooksMerged: number;
}

async function fetchAdminGenres(): Promise<{ genres: AdminGenre[] }> {
  const response = await fetch("/api/admin/genres", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch genres");
  }
  return response.json();
}

async function renameGenre(
  id: string,
  name: string
): Promise<AdminGenre | RenameConflict> {
  const response = await fetch(`/api/admin/genres/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error("Failed to rename genre");
  }
  return response.json();
}

async function mergeGenres(
  sourceId: string,
  targetId: string
): Promise<MergeResult> {
  const response = await fetch(`/api/admin/genres/${sourceId}/merge/${targetId}`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to merge genres");
  }
  return response.json();
}

async function deleteGenre(id: string): Promise<void> {
  const response = await fetch(`/api/admin/genres/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to delete genre");
  }
}

export function useAdminGenres() {
  return useQuery({
    queryKey: queryKeys.adminGenres.list(),
    queryFn: fetchAdminGenres,
    select: (data) => data.genres,
    staleTime: 30 * 1000,
  });
}

export function useRenameGenre() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameGenre(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminGenres.all });
      // Also invalidate public genre lists
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.genres() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.genres() });
    },
  });
}

export function useMergeGenres() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      mergeGenres(sourceId, targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminGenres.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.genres() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.genres() });
    },
  });
}

export function useDeleteGenre() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteGenre,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminGenres.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.genres() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.genres() });
    },
  });
}
