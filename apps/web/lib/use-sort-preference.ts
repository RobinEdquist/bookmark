"use client";

import { useState, useEffect, useCallback } from "react";

export type SortField = "title" | "createdAt" | "author" | "rating" | "series" | "recentlyAdded" | "startYear";
export type SortOrder = "asc" | "desc";

export interface SortPreference {
  sortBy: SortField;
  sortOrder: SortOrder;
}

const DEFAULT_SORT: SortPreference = {
  sortBy: "createdAt",
  sortOrder: "desc",
};

const DEFAULT_SORT_COMICS: SortPreference = {
  sortBy: "title",
  sortOrder: "asc",
};

// Default directions when selecting a new sort field
const DEFAULT_DIRECTIONS: Record<SortField, SortOrder> = {
  title: "asc",
  createdAt: "desc",
  author: "asc",
  rating: "desc",
  series: "asc",
  recentlyAdded: "desc",
  startYear: "asc",
};

function getStorageKey(libraryType: "audiobooks" | "ebooks" | "comics"): string {
  return `bookmark-${libraryType}-sort`;
}

function loadFromStorage(key: string): SortPreference | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    // Validate the parsed data
    if (
      parsed &&
      typeof parsed.sortBy === "string" &&
      typeof parsed.sortOrder === "string" &&
      ["title", "createdAt", "author", "rating", "series", "recentlyAdded", "startYear"].includes(parsed.sortBy) &&
      ["asc", "desc"].includes(parsed.sortOrder)
    ) {
      return parsed as SortPreference;
    }
  } catch {
    // Invalid JSON, ignore
  }
  return null;
}

function saveToStorage(key: string, preference: SortPreference): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(preference));
}

export function useSortPreference(libraryType: "audiobooks" | "ebooks" | "comics") {
  const [preference, setPreference] = useState<SortPreference>(
    libraryType === "comics" ? DEFAULT_SORT_COMICS : DEFAULT_SORT
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const key = getStorageKey(libraryType);
    const stored = loadFromStorage(key);
    if (stored) {
      setPreference(stored);
    }
    setIsLoaded(true);
  }, [libraryType]);

  // Save to localStorage when preference changes (after initial load)
  useEffect(() => {
    if (!isLoaded) return;
    const key = getStorageKey(libraryType);
    saveToStorage(key, preference);
  }, [preference, libraryType, isLoaded]);

  const setSortField = useCallback((field: SortField) => {
    setPreference((prev) => {
      if (prev.sortBy === field) {
        // Toggle direction if same field
        return {
          ...prev,
          sortOrder: prev.sortOrder === "asc" ? "desc" : "asc",
        };
      }
      // New field, use default direction for that field
      return {
        sortBy: field,
        sortOrder: DEFAULT_DIRECTIONS[field],
      };
    });
  }, []);

  return {
    sortBy: preference.sortBy,
    sortOrder: preference.sortOrder,
    setSortField,
    isLoaded,
  };
}
