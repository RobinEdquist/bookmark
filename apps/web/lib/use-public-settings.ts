"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface PublicSettings {
  signupsEnabled: boolean;
}

async function fetchPublicSettings(): Promise<PublicSettings> {
  const response = await fetch("/api/settings/public");
  if (!response.ok) {
    throw new Error("Failed to fetch settings");
  }
  return response.json();
}

export function usePublicSettings() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.settings.public(),
    queryFn: fetchPublicSettings,
    // Fail secure: if we can't fetch settings, assume signups disabled
    placeholderData: { signupsEnabled: false },
  });

  return {
    settings: data ?? { signupsEnabled: false },
    isLoading,
    error,
  };
}
