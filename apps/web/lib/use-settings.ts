"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export type MetadataSource = "manual" | "embedded" | "hardcover" | "filename" | "folder_image";

export interface MetadataFieldPriority {
  title: MetadataSource[];
  subtitle: MetadataSource[];
  author: MetadataSource[];
  narrator: MetadataSource[];
  description: MetadataSource[];
  publisher: MetadataSource[];
  publishedDate: MetadataSource[];
  language: MetadataSource[];
  genres: MetadataSource[];
  series: MetadataSource[];
  seriesOrder: MetadataSource[];
  cover: MetadataSource[];
}

export interface Settings {
  signupsEnabled: boolean;
  libraryPath: string | null;
  metadataPriority: MetadataFieldPriority;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingsDto {
  signupsEnabled?: boolean;
  libraryPath?: string;
  metadataPriority?: MetadataFieldPriority;
}

async function fetchSettings(): Promise<Settings> {
  const response = await fetch("/api/settings", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch settings");
  }
  return response.json();
}

async function updateSettingsApi(updates: UpdateSettingsDto): Promise<Settings> {
  const response = await fetch("/api/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to update settings");
  }

  return response.json();
}

export function useSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.settings.private(),
    queryFn: fetchSettings,
  });

  const mutation = useMutation({
    mutationFn: updateSettingsApi,
    onSuccess: (newSettings) => {
      // Update the settings cache
      queryClient.setQueryData(queryKeys.settings.private(), newSettings);
      // Invalidate all settings queries (includes public)
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });

  return {
    settings: data ?? null,
    isLoading,
    error,
    updateSettings: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    refetch,
  };
}
