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
  // Don't filter by status - backend returns actionable errors (pending + retrying) by default
  const response = await fetch(`/api/admin/import-errors`, {
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

async function dismissImportError(errorId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/admin/import-errors/${errorId}/ignore`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to dismiss import error");
  }

  return response.json();
}

async function deleteImportError(errorId: string): Promise<void> {
  const response = await fetch(`/api/admin/import-errors/${errorId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to delete import error");
  }
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
      queryClient.invalidateQueries({ queryKey: queryKeys.importErrors.all });
    },
  });
}

export function useDismissImportError() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: dismissImportError,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.importErrors.all });
    },
  });
}

export function useDeleteImportError() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteImportError,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.importErrors.all });
    },
  });
}
