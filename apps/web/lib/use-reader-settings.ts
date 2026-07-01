"use client";

import { useCallback, useState } from "react";
import type { ReaderThemeName } from "./reader-themes";

const STORAGE_KEY = "ebook-reader-settings";

export interface ReaderSettings {
  /** Font size as a percentage of the publisher default (80–160). */
  fontSize: number;
  fontFamily: "serif" | "sans";
  /** Line height multiplier (1.2–2.0). */
  lineHeight: number;
  /** Page margin as a viewport percentage (3–10). */
  margin: number;
  theme: ReaderThemeName;
  flow: "paginated" | "scrolled";
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 100,
  fontFamily: "serif",
  lineHeight: 1.5,
  margin: 6,
  theme: "light",
  flow: "paginated",
};

const THEMES = ["light", "sepia", "dark"] as const;
const FLOWS = ["paginated", "scrolled"] as const;
const FONT_FAMILIES = ["serif", "sans"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sanitize(raw: unknown): ReaderSettings {
  const defaults = DEFAULT_READER_SETTINGS;
  if (typeof raw !== "object" || raw === null) return defaults;
  const obj = raw as Record<string, unknown>;
  return {
    fontSize:
      typeof obj.fontSize === "number"
        ? clamp(obj.fontSize, 80, 160)
        : defaults.fontSize,
    fontFamily: FONT_FAMILIES.includes(obj.fontFamily as "serif" | "sans")
      ? (obj.fontFamily as "serif" | "sans")
      : defaults.fontFamily,
    lineHeight:
      typeof obj.lineHeight === "number"
        ? clamp(obj.lineHeight, 1.2, 2.0)
        : defaults.lineHeight,
    margin:
      typeof obj.margin === "number"
        ? clamp(obj.margin, 3, 10)
        : defaults.margin,
    theme: THEMES.includes(obj.theme as ReaderThemeName)
      ? (obj.theme as ReaderThemeName)
      : defaults.theme,
    flow: FLOWS.includes(obj.flow as "paginated" | "scrolled")
      ? (obj.flow as "paginated" | "scrolled")
      : defaults.flow,
  };
}

export function getInitialReaderSettings(
  fallbackTheme?: ReaderThemeName,
): ReaderSettings {
  const defaults = {
    ...DEFAULT_READER_SETTINGS,
    ...(fallbackTheme ? { theme: fallbackTheme } : {}),
  };
  if (typeof window === "undefined") return defaults;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaults;
    return sanitize(JSON.parse(stored));
  } catch {
    return defaults;
  }
}

export function useReaderSettings(fallbackTheme?: ReaderThemeName) {
  const [settings, setSettings] = useState<ReaderSettings>(() =>
    getInitialReaderSettings(fallbackTheme),
  );

  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = sanitize({ ...prev, ...patch });
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable (private mode etc.) - settings stay in memory
      }
      return next;
    });
  }, []);

  return { settings, update };
}
