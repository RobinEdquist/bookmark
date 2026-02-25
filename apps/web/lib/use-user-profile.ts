"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

// ===== Types =====

export interface UserProfile {
  id: string;
  name: string;
  image: string | null;
  createdAt: string;
}

export interface UserStatsResponse {
  user: UserProfile;
  totalListeningTime: number;
  audiobooksCompleted: number;
  audiobooksInProgress: number;
  ebooksCompleted: number;
  ebooksInProgress: number;
  longestStreak: number;
  currentStreak: number;
}

export interface UserActivityResponse {
  days: Record<string, number>;
}

export interface LibraryProgressItem {
  id: string;
  type: "audiobook" | "ebook";
  title: string;
  authorName: string | null;
  coverUrl: string | null;
  progressPercent: number;
  completed: boolean;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  updatedAt: string;
}

export interface LibraryProgressResponse {
  items: LibraryProgressItem[];
  total: number;
}

export interface ListeningHistoryItem {
  id: string;
  audiobookId: string;
  audiobookTitle: string;
  authorName: string | null;
  coverUrl: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  startPosition: number;
  endPosition: number;
}

export interface ListeningHistoryResponse {
  items: ListeningHistoryItem[];
  total: number;
}

// ===== Fetch Functions =====

async function fetchUserStats(id: string): Promise<UserStatsResponse> {
  const response = await fetch(`/api/user-profile/${id}/stats`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user stats");
  }

  return response.json();
}

async function fetchUserActivity(
  id: string,
  year: number
): Promise<UserActivityResponse> {
  const response = await fetch(
    `/api/user-profile/${id}/activity?year=${year}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch user activity");
  }

  return response.json();
}

export interface LibraryProgressFilters {
  type?: string;
  status?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

async function fetchLibraryProgress(
  id: string,
  filters: LibraryProgressFilters = {}
): Promise<LibraryProgressResponse> {
  const params = new URLSearchParams();

  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.limit !== undefined) params.set("limit", filters.limit.toString());
  if (filters.offset !== undefined)
    params.set("offset", filters.offset.toString());

  const response = await fetch(
    `/api/user-profile/${id}/library-progress?${params}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch library progress");
  }

  return response.json();
}

async function fetchListeningHistory(
  id: string,
  limit?: number,
  offset?: number
): Promise<ListeningHistoryResponse> {
  const params = new URLSearchParams();

  if (limit !== undefined) params.set("limit", limit.toString());
  if (offset !== undefined) params.set("offset", offset.toString());

  const response = await fetch(
    `/api/user-profile/${id}/listening-history?${params}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch listening history");
  }

  return response.json();
}

// ===== Hooks =====

export function useUserStats(id: string) {
  return useQuery({
    queryKey: queryKeys.userProfile.stats(id),
    queryFn: () => fetchUserStats(id),
    enabled: !!id,
  });
}

export function useUserActivity(id: string, year: number) {
  return useQuery({
    queryKey: queryKeys.userProfile.activity(id, year),
    queryFn: () => fetchUserActivity(id, year),
    enabled: !!id,
  });
}

export function useLibraryProgress(
  id: string,
  filters: LibraryProgressFilters = {}
) {
  return useQuery({
    queryKey: queryKeys.userProfile.libraryProgress(id, filters),
    queryFn: () => fetchLibraryProgress(id, filters),
    enabled: !!id,
  });
}

export function useListeningHistory(
  id: string,
  limit?: number,
  offset?: number
) {
  return useQuery({
    queryKey: queryKeys.userProfile.listeningHistory(id, offset),
    queryFn: () => fetchListeningHistory(id, limit, offset),
    enabled: !!id,
  });
}
