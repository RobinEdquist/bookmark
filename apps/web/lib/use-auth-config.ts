"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface AuthConfig {
  emailPasswordEnabled: boolean;
  oidcEnabled: boolean;
  oidcButtonText: string;
}

async function fetchAuthConfig(): Promise<AuthConfig> {
  const response = await fetch("/api/settings/auth-config", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch auth config");
  }
  return response.json();
}

export function useAuthConfig() {
  return useQuery({
    queryKey: queryKeys.settings.authConfig(),
    queryFn: fetchAuthConfig,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
