"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface UpdateInfo {
  available: boolean;
  latestVersion: string;
  releaseName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  checkedAt: string;
}

export interface VersionInfo {
  /** Full version, e.g. `0.1.0` or `0.1.0-12-ga1b2c3d` for a build off main. */
  version: string;
  /** The release this build derives from, dev suffix stripped. */
  baseVersion: string;
  channel: "release" | "dev";
  gitSha: string;
  buildTime: string | null;
  /** Null when update checks are disabled, pending, or GitHub was unreachable. */
  update: UpdateInfo | null;
}

async function fetchVersion(): Promise<VersionInfo> {
  const response = await fetch("/api/version", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch version");
  }
  return response.json();
}

/**
 * The running build's version, plus the last release check.
 *
 * The version itself is immutable for the life of the process, but the update
 * result is refreshed by the backend every 6 hours — so this refetches hourly
 * rather than caching forever. Re-fetching the immutable half costs nothing.
 */
export function useVersion() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.version.current(),
    queryFn: fetchVersion,
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    retry: false,
  });

  return { version: data ?? null, isLoading, error };
}
