"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const themes = [
  "default",
  "tokyo-night",
  "tokyo-storm",
  "tokyo-moon",
  "tokyo-day",
  "synthwave",
  "catppuccin-mocha",
  "catppuccin-macchiato",
  "catppuccin-frappe",
  "catppuccin-latte",
  "yin-yang",
  "yang-yin",
] as const;
export type Theme = (typeof themes)[number];

export function isValidTheme(theme: string): theme is Theme {
  return themes.includes(theme as Theme);
}

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

export function useTheme() {
  const queryClient = useQueryClient();

  const { data: theme = "default", isLoading } = useQuery({
    queryKey: ["theme"],
    queryFn: fetchTheme,
    staleTime: Infinity,
    initialData: "default",
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
