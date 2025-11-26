"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";

export interface UserPermissions {
  canEditMetadata: boolean;
  canUploadAudiobooks: boolean;
  canDeleteAudiobooks: boolean;
  canGenerateApiKeys: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  permissions: UserPermissions;
  blacklistedTags: string[];
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  isAdmin?: boolean;
  canEditMetadata?: boolean;
  canUploadAudiobooks?: boolean;
  canDeleteAudiobooks?: boolean;
  canGenerateApiKeys?: boolean;
  blacklistedTags?: string[];
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  image?: string;
  isAdmin?: boolean;
  canEditMetadata?: boolean;
  canUploadAudiobooks?: boolean;
  canDeleteAudiobooks?: boolean;
  canGenerateApiKeys?: boolean;
  blacklistedTags?: string[];
}

export interface BanUserInput {
  reason?: string;
  expiresAt?: string;
}

async function fetchUsers(search?: string): Promise<{ users: User[]; total: number }> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const res = await fetch(`/api/users?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

async function createUser(data: CreateUserInput): Promise<User> {
  const res = await fetch("/api/users", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to create user");
  }
  return res.json();
}

async function updateUser(id: string, data: UpdateUserInput): Promise<User> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to update user");
  }
  return res.json();
}

async function banUser(id: string, data: BanUserInput): Promise<User> {
  const res = await fetch(`/api/users/${id}/ban`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to ban user");
  }
  return res.json();
}

async function unbanUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}/unban`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to unban user");
  }
  return res.json();
}

async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to delete user");
  }
}

export function useUsers(search?: string) {
  return useQuery({
    queryKey: ["users", search],
    queryFn: () => fetchUsers(search),
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserInput }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useBanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BanUserInput }) =>
      banUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUnbanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unbanUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
