import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

interface AudiobookProgress {
  audiobookId: string;
  position: number;
  completed: boolean;
  completedAt: string | null;
  startedAt: string;
  updatedAt: string;
}

interface ProgressWithAudiobook extends AudiobookProgress {
  audiobook: {
    id: string;
    title: string;
    coverUrl: string | null;
    duration: number | null;
  };
  progressPercent: number;
}

interface ListeningStats {
  today: {
    duration: number;
    sessions: number;
  };
  thisWeek: {
    duration: number;
    sessions: number;
  };
  thisMonth: {
    duration: number;
    sessions: number;
  };
  allTime: {
    duration: number;
  };
  audiobooks: {
    started: number;
    completed: number;
  };
  recentlyPlayed: ProgressWithAudiobook[];
}

async function fetchProgress(audiobookId: string): Promise<AudiobookProgress> {
  const response = await fetch(`/api/progress/${audiobookId}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch progress");
  }

  return response.json();
}

async function fetchAllProgress(): Promise<ProgressWithAudiobook[]> {
  const response = await fetch("/api/progress", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch progress");
  }

  return response.json();
}

async function fetchListeningStats(): Promise<ListeningStats> {
  const response = await fetch("/api/progress/stats", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch listening stats");
  }

  return response.json();
}

async function updateProgress(
  audiobookId: string,
  position: number
): Promise<AudiobookProgress> {
  const response = await fetch(`/api/progress/${audiobookId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position }),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to update progress");
  }

  return response.json();
}

export function useProgress(audiobookId: string) {
  return useQuery<AudiobookProgress>({
    queryKey: queryKeys.progress.detail(audiobookId),
    queryFn: () => fetchProgress(audiobookId),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useAllProgress() {
  return useQuery({
    queryKey: queryKeys.progress.list(),
    queryFn: fetchAllProgress,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useListeningStats() {
  return useQuery({
    queryKey: queryKeys.progress.stats(),
    queryFn: fetchListeningStats,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ audiobookId, position }: { audiobookId: string; position: number }) =>
      updateProgress(audiobookId, position),
    onSuccess: (data, variables) => {
      // Update the specific progress cache
      queryClient.setQueryData(
        queryKeys.progress.detail(variables.audiobookId),
        data
      );
      // Invalidate the list to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.progress.list(),
      });
    },
  });
}

async function resetProgress(audiobookId: string): Promise<void> {
  const response = await fetch(`/api/progress/${audiobookId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to reset progress");
  }
}

async function hideProgress(audiobookId: string): Promise<void> {
  const response = await fetch(`/api/progress/${audiobookId}/hide`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to hide progress");
  }
}

export function useResetProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (audiobookId: string) => resetProgress(audiobookId),
    onSuccess: (_data, audiobookId) => {
      // Remove the specific progress cache
      queryClient.removeQueries({
        queryKey: queryKeys.progress.detail(audiobookId),
      });
      // Invalidate the list and stats
      queryClient.invalidateQueries({
        queryKey: queryKeys.progress.list(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.progress.stats(),
      });
    },
  });
}

export function useHideProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (audiobookId: string) => hideProgress(audiobookId),
    onSuccess: () => {
      // Invalidate the list to remove the hidden item
      queryClient.invalidateQueries({
        queryKey: queryKeys.progress.list(),
      });
      // Also invalidate stats since recentlyPlayed uses getAllProgress
      queryClient.invalidateQueries({
        queryKey: queryKeys.progress.stats(),
      });
    },
  });
}

export type { AudiobookProgress, ProgressWithAudiobook, ListeningStats };
