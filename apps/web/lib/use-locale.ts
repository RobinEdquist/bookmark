"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { locales, type Locale, isValidLocale } from "../i18n/config";

async function fetchLanguage(): Promise<string> {
  const res = await fetch("/api/users/me/language", {
    credentials: "include",
  });
  if (!res.ok) {
    // Not logged in or error - use cookie or default
    const cookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("locale="))
      ?.split("=")[1];
    return cookie && isValidLocale(cookie) ? cookie : "en";
  }
  const data = await res.json();
  return data.language;
}

async function updateLanguage(language: string): Promise<void> {
  // Always set cookie
  document.cookie = `locale=${language}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

  // Try to update server (will fail if not logged in, that's okay)
  try {
    await fetch("/api/users/me/language", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    });
  } catch {
    // Ignore - cookie is set regardless
  }
}

export function useLocale() {
  const queryClient = useQueryClient();

  const { data: locale = "en", isLoading } = useQuery({
    queryKey: ["locale"],
    queryFn: fetchLanguage,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: updateLanguage,
    onSuccess: (_, language) => {
      queryClient.setQueryData(["locale"], language);
      // Reload page to apply new locale
      window.location.reload();
    },
  });

  const setLocale = useCallback(
    (newLocale: Locale) => {
      mutation.mutate(newLocale);
    },
    [mutation]
  );

  return {
    locale: locale as Locale,
    setLocale,
    isLoading,
    isUpdating: mutation.isPending,
    locales,
  };
}
