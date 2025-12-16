"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface RescanStatus {
  isRescanning: boolean;
  phase?: "preparing" | "rescanning";
  total?: number;
  processed?: number;
  percentage?: number;
  currentAudiobook?: string;
}

export interface RescanResult {
  total: number;
  succeeded: number;
  failed: number;
}

const defaultRescanStatus: RescanStatus = { isRescanning: false };

async function fetchRescanStatus(): Promise<RescanStatus> {
  const response = await fetch("/api/admin/library-watcher/rescan-status", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch rescan status");
  }

  return response.json();
}

async function triggerRescanApi(): Promise<{ success: boolean; result: RescanResult }> {
  const response = await fetch("/api/admin/library-watcher/rescan", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to trigger rescan");
  }

  return response.json();
}

export function useRescanStatus() {
  // Use query for WebSocket-updated status
  const { data: rescanStatus } = useQuery<RescanStatus>({
    queryKey: queryKeys.tasks.rescan(),
    queryFn: fetchRescanStatus,
    staleTime: Infinity, // Data is pushed via WebSocket
    refetchOnWindowFocus: false,
  });

  return rescanStatus ?? defaultRescanStatus;
}

export function useRescan() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: triggerRescanApi,
    onSuccess: () => {
      // Invalidate audiobooks to refresh the list with updated metadata
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
    },
  });

  return {
    rescan: mutation.mutateAsync,
    isRescanPending: mutation.isPending,
    rescanError: mutation.error,
  };
}
