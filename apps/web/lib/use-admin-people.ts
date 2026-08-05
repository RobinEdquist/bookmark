"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface AdminPerson {
  id: string;
  name: string;
  audiobookAuthorCount: number;
  ebookAuthorCount: number;
  audiobookNarratorCount: number;
}

export interface RenameConflict {
  conflict: true;
  existingPerson: { id: string; name: string };
  sourcePerson: { id: string; name: string };
  audiobookAuthorCount: number;
  ebookAuthorCount: number;
  audiobookNarratorCount: number;
}

export interface MergeResult {
  id: string;
  name: string;
  audiobookAuthorLinksMerged: number;
  ebookAuthorLinksMerged: number;
  audiobookNarratorLinksMerged: number;
}

export interface SplitResult {
  id: string;
  names: string[];
  audiobookAuthorLinksSplit: number;
  ebookAuthorLinksSplit: number;
  audiobookNarratorLinksSplit: number;
}

type PeopleRole = "authors" | "narrators";

async function fetchPeople(
  role: PeopleRole,
  search?: string,
): Promise<{ people: AdminPerson[] }> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const response = await fetch(`/api/admin/people/${role}${query}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${role}`);
  }
  return response.json();
}

async function renamePerson(
  id: string,
  name: string,
): Promise<AdminPerson | RenameConflict> {
  const response = await fetch(`/api/admin/people/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error("Failed to rename person");
  }
  return response.json();
}

async function mergePeople(
  sourceId: string,
  targetId: string,
): Promise<MergeResult> {
  const response = await fetch(
    `/api/admin/people/${sourceId}/merge/${targetId}`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  if (!response.ok) {
    throw new Error("Failed to merge people");
  }
  return response.json();
}

async function splitPerson(id: string, names: string[]): Promise<SplitResult> {
  const response = await fetch(`/api/admin/people/${id}/split`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
  if (!response.ok) {
    throw new Error("Failed to split person");
  }
  return response.json();
}

function invalidatePeopleQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.adminPeople.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
}

export function useAdminPeople(role: PeopleRole, search?: string) {
  return useQuery({
    queryKey:
      role === "authors"
        ? queryKeys.adminPeople.authors(search)
        : queryKeys.adminPeople.narrators(search),
    queryFn: () => fetchPeople(role, search),
    select: (data) => data.people,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useRenamePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renamePerson(id, name),
    onSuccess: () => invalidatePeopleQueries(queryClient),
  });
}

export function useMergePeople() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sourceId,
      targetId,
    }: {
      sourceId: string;
      targetId: string;
    }) => mergePeople(sourceId, targetId),
    onSuccess: () => invalidatePeopleQueries(queryClient),
  });
}

export function useSplitPersonMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, names }: { id: string; names: string[] }) =>
      splitPerson(id, names),
    onSuccess: () => invalidatePeopleQueries(queryClient),
  });
}
