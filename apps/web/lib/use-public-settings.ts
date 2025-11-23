"use client";

import { useState, useEffect } from "react";

interface PublicSettings {
  signupsEnabled: boolean;
}

export function usePublicSettings() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch("/api/settings/public");
        if (!response.ok) {
          throw new Error("Failed to fetch settings");
        }
        const data = await response.json();
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
        // Fail secure: if we can't fetch settings, assume signups disabled
        setSettings({ signupsEnabled: false });
      } finally {
        setIsLoading(false);
      }
    }

    fetchSettings();
  }, []);

  return { settings, isLoading, error };
}
