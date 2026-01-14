import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

interface EbookProgress {
  ebookId: string;
  cfi: string | null;
  progressPercent: number;
  completed: boolean;
  completedAt: string | null;
  startedAt: string;
  updatedAt: string;
}

interface EbookProgressWithEbook extends EbookProgress {
  ebook: {
    id: string;
    title: string;
    coverUrl: string | null;
    format: string;
  };
}

async function fetchEbookProgress(ebookId: string): Promise<EbookProgress> {
  const response = await fetch(`/api/ebook-progress/${ebookId}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch ebook progress");
  }

  return response.json();
}

async function fetchAllEbookProgress(): Promise<EbookProgressWithEbook[]> {
  const response = await fetch("/api/ebook-progress", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch ebook progress");
  }

  return response.json();
}

async function updateEbookProgress(
  ebookId: string,
  cfi: string | null,
  progressPercent: number
): Promise<EbookProgress> {
  const response = await fetch(`/api/ebook-progress/${ebookId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cfi, progressPercent }),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to update ebook progress");
  }

  return response.json();
}

async function hideEbookProgress(ebookId: string): Promise<void> {
  const response = await fetch(`/api/ebook-progress/${ebookId}/hide`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to hide ebook progress");
  }
}

export function useEbookProgress(ebookId: string) {
  return useQuery<EbookProgress>({
    queryKey: queryKeys.ebookProgress.detail(ebookId),
    queryFn: () => fetchEbookProgress(ebookId),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useAllEbookProgress() {
  return useQuery({
    queryKey: queryKeys.ebookProgress.list(),
    queryFn: fetchAllEbookProgress,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useUpdateEbookProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ebookId,
      cfi,
      progressPercent,
    }: {
      ebookId: string;
      cfi: string | null;
      progressPercent: number;
    }) => updateEbookProgress(ebookId, cfi, progressPercent),
    onSuccess: (data, variables) => {
      // Update the specific progress cache
      queryClient.setQueryData(
        queryKeys.ebookProgress.detail(variables.ebookId),
        data
      );
      // Invalidate the list to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.ebookProgress.list(),
      });
    },
  });
}

export function useHideEbookProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ebookId: string) => hideEbookProgress(ebookId),
    onSuccess: () => {
      // Invalidate the list to remove the hidden item
      queryClient.invalidateQueries({
        queryKey: queryKeys.ebookProgress.list(),
      });
    },
  });
}

export type { EbookProgress, EbookProgressWithEbook };
