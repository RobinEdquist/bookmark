"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface HiddenAudiobook {
  id: string;
  title: string;
  /** Folder relative to the audiobook library; null for a root-level file */
  folderPath: string | null;
}

interface HiddenAudiobooksResponse {
  items: HiddenAudiobook[];
}

/**
 * `restored`: back in the library with its files re-read.
 * `removed`: its files no longer exist, so the record was deleted.
 */
export type RestoreHiddenAudiobookOutcome = "restored" | "removed";

async function fetchHiddenAudiobooks(): Promise<HiddenAudiobooksResponse> {
  const response = await fetch("/api/admin/library-watcher/hidden-audiobooks", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch hidden audiobooks");
  }

  return response.json();
}

async function restoreHiddenAudiobook(
  id: string,
): Promise<{ outcome: RestoreHiddenAudiobookOutcome }> {
  const response = await fetch(
    `/api/admin/library-watcher/hidden-audiobooks/${id}/restore`,
    { method: "POST", credentials: "include" },
  );

  if (!response.ok) {
    throw new Error("Failed to restore audiobook");
  }

  return response.json();
}

export function useHiddenAudiobooks() {
  return useQuery({
    queryKey: queryKeys.hiddenAudiobooks.list(),
    queryFn: fetchHiddenAudiobooks,
    staleTime: 30000, // 30 seconds
  });
}

export function useRestoreHiddenAudiobook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreHiddenAudiobook,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.hiddenAudiobooks.all,
      });
      // The book is back in (or gone from) every library view
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
    },
  });
}
