"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const MAX_API_KEYS = 10;

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

async function fetchMyApiKeys(): Promise<ApiKeyInfo[]> {
  const res = await fetch("/api/api-keys/me", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch API keys");
  const data = await res.json();
  return data ?? [];
}

async function createApiKey(input: { name?: string }): Promise<ApiKeyCreated> {
  const res = await fetch("/api/api-keys", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.name ? { name: input.name } : {}),
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

export function useMyApiKeys() {
  return useQuery({
    queryKey: ["api-keys", "me"],
    queryFn: fetchMyApiKeys,
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
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

// Admin hooks
async function fetchUserApiKeys(userId: string): Promise<ApiKeyInfo[]> {
  const res = await fetch(`/api/api-keys/user/${userId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch user API keys");
  const data = await res.json();
  return data ?? [];
}

async function revokeUserApiKeyById(input: {
  userId: string;
  keyId: string;
}): Promise<void> {
  const res = await fetch(`/api/api-keys/user/${input.userId}/${input.keyId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to revoke user API key");
}

async function revokeUserApiKeys(userId: string): Promise<void> {
  const res = await fetch(`/api/api-keys/user/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to revoke user API keys");
}

export function useUserApiKeys(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["api-keys", "user", userId],
    queryFn: () => fetchUserApiKeys(userId as string),
    enabled: enabled && !!userId,
  });
}

export function useRevokeUserApiKeyById() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeUserApiKeyById,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useRevokeUserApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeUserApiKeys,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
