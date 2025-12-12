"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface ImportError {
  id: string;
  filePath: string;
  errorMessage: string;
  errorCode: string | null;
  errorDetails: { stack?: string } | null;
  status: "pending" | "retrying" | "resolved" | "ignored";
  attemptCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  resolvedAt: string | null;
  ignoredAt: string | null;
  ignoredBy: string | null;
}

export interface ImportErrorsResponse {
  errors: ImportError[];
  total: number;
}

async function fetchImportErrors(): Promise<ImportErrorsResponse> {
  const params = new URLSearchParams({
    status: "pending",
  });

  const response = await fetch(`/api/admin/import-errors?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch import errors");
  }

  return response.json();
}

async function retryImport(errorId: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`/api/admin/import-errors/${errorId}/retry`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to retry import");
  }

  return response.json();
}

export function useImportErrors() {
  return useQuery({
    queryKey: queryKeys.importErrors.list(),
    queryFn: fetchImportErrors,
    staleTime: 30000, // 30 seconds
  });
}

export function useRetryImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryImport,
    onSuccess: () => {
      // Invalidate all import errors queries to refresh the list
      queryClient.invalidateQueries({ queryKey: queryKeys.importErrors.all });
    },
  });
}
