"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "./query-keys";

interface HardcoverStatus {
  configured: boolean;
}

interface ValidateResponse {
  valid: boolean;
  error?: string;
}

async function fetchStatus(): Promise<HardcoverStatus> {
  const response = await fetch("/api/hardcover/status", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Hardcover status");
  }
  return response.json();
}

async function validateApiKey(apiKey: string): Promise<ValidateResponse> {
  const response = await fetch("/api/hardcover/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ apiKey }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to validate API key");
  }

  return response.json();
}

async function disconnectApi(): Promise<void> {
  const response = await fetch("/api/hardcover/disconnect", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to disconnect");
  }
}

async function searchBooks(query: string): Promise<unknown> {
  const response = await fetch(`/api/hardcover/search?q=${encodeURIComponent(query)}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Search failed");
  }

  return response.json();
}

export function useHardcoverStatus() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.hardcover.status(),
    queryFn: fetchStatus,
  });

  return {
    isConfigured: data?.configured ?? false,
    isLoading,
    error,
    refetch,
  };
}

export function useHardcoverConnect() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: validateApiKey,
    onSuccess: (result) => {
      if (result.valid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.hardcover.all });
      }
    },
  });

  return {
    connect: mutation.mutateAsync,
    isConnecting: mutation.isPending,
    error: mutation.error,
  };
}

export function useHardcoverDisconnect() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: disconnectApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hardcover.all });
    },
  });

  return {
    disconnect: mutation.mutateAsync,
    isDisconnecting: mutation.isPending,
    error: mutation.error,
  };
}

export function useHardcoverSearch() {
  const [searchResult, setSearchResult] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: searchBooks,
    onSuccess: (data) => {
      setSearchResult(data);
    },
  });

  return {
    search: mutation.mutateAsync,
    isSearching: mutation.isPending,
    error: mutation.error,
    searchResult,
    clearResult: () => setSearchResult(null),
  };
}
