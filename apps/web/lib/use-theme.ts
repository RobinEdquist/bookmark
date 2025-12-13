"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { themes, isValidTheme, type Theme } from "./theme-config";

// Re-export for convenience
export { themes, isValidTheme, type Theme } from "./theme-config";

async function fetchTheme(): Promise<string> {
  const res = await fetch("/api/users/me/theme", {
    credentials: "include",
  });
  if (!res.ok) {
    // Not logged in or error - use cookie or default
    const cookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("theme="))
      ?.split("=")[1];
    return cookie && isValidTheme(cookie) ? cookie : "default";
  }
  const data = await res.json();
  return data.theme;
}

async function updateTheme(theme: string): Promise<void> {
  // Always set cookie
  document.cookie = `theme=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

  // Try to update server (will fail if not logged in, that's okay)
  try {
    await fetch("/api/users/me/theme", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    });
  } catch {
    // Ignore - cookie is set regardless
  }
}

// Get initial theme from cookie (client-side only)
function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "default";
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("theme="))
    ?.split("=")[1];
  return cookie && isValidTheme(cookie) ? cookie : "default";
}

export function useTheme() {
  const queryClient = useQueryClient();

  const { data: theme = getInitialTheme(), isLoading } = useQuery({
    queryKey: ["theme"],
    queryFn: fetchTheme,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: updateTheme,
    onSuccess: (_, newTheme) => {
      queryClient.setQueryData(["theme"], newTheme);
    },
  });

  const setTheme = useCallback(
    (newTheme: Theme) => {
      mutation.mutate(newTheme);
    },
    [mutation]
  );

  return {
    theme: theme as Theme,
    setTheme,
    isLoading,
    isUpdating: mutation.isPending,
    themes,
  };
}
