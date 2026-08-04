"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface VersionInfo {
  /** Full version, e.g. `0.1.0` or `0.1.0-12-ga1b2c3d` for a build off main. */
  version: string;
  /** The release this build derives from, dev suffix stripped. */
  baseVersion: string;
  channel: "release" | "dev";
  gitSha: string;
  buildTime: string | null;
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
 * The running build's version. Baked into the image at build time, so it cannot
 * change while the app is open — cached indefinitely and never refetched.
 */
export function useVersion() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.version.current(),
    queryFn: fetchVersion,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return { version: data ?? null, isLoading, error };
}
