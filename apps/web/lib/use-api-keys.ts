"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ApiKeyInfo {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: string;
  lastRequest: string | null;
  lastIp: string | null;
}

export interface ApiKeyCreated {
  id: string;
  name: string;
  key: string;
  start: string;
  createdAt: string;
}

async function fetchMyApiKey(): Promise<ApiKeyInfo | null> {
  const res = await fetch("/api/api-keys/me", { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch API key");
  const data = await res.json();
  // Backend returns null with 200 status when no key exists
  return data ?? null;
}

async function createApiKey(): Promise<ApiKeyCreated> {
  const res = await fetch("/api/api-keys", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to create API key");
  return res.json();
}

async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`/api/api-keys/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to revoke API key");
}

export function useMyApiKey() {
  return useQuery({
    queryKey: ["api-keys", "me"],
    queryFn: fetchMyApiKey,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      // Set the data to null immediately, then invalidate to refetch
      queryClient.setQueryData(["api-keys", "me"], null);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

// Admin hooks
async function revokeUserApiKey(userId: string): Promise<void> {
  const res = await fetch(`/api/api-keys/user/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to revoke user API key");
}

export function useRevokeUserApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeUserApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
