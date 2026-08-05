"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface DirectoryInfo {
  name: string;
  path: string;
}

export interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryInfo[];
}

async function browseDirectory(path?: string): Promise<BrowseResult> {
  const params = new URLSearchParams();
  if (path) params.set("path", path);

  const response = await fetch(`/api/filesystem/browse?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to browse directory");
  }

  return response.json();
}

async function createDirectoryApi(path: string): Promise<DirectoryInfo> {
  const response = await fetch("/api/filesystem/create-directory", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to create directory");
  }

  return response.json();
}

/**
 * Browse a directory. `enabled: false` keeps the query mounted but idle, which
 * lets a caller declare a conditional fallback browse in render instead of
 * reacting to a failure by mutating the path it asked for.
 */
export function useFilesystemBrowse(path?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.filesystem.browse(path || ""),
    queryFn: () => browseDirectory(path),
    enabled,
  });
}

export function useCreateDirectory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDirectoryApi,
    onSuccess: () => {
      // Invalidate all filesystem queries to refresh directory listings
      queryClient.invalidateQueries({ queryKey: queryKeys.filesystem.all });
    },
  });
}
