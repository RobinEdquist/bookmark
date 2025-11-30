"use client";

import { useEffect } from "react";
import { useTheme, type Theme } from "../../lib/use-theme";

const themeClasses: Record<Theme, string[]> = {
  default: ["dark"],
  "tokyo-night": ["dark", "theme-tokyo-night"],
  "tokyo-storm": ["dark", "theme-tokyo-storm"],
  "tokyo-moon": ["dark", "theme-tokyo-moon"],
  "tokyo-day": ["theme-tokyo-day"], // Light theme, no "dark" class
  synthwave: ["dark", "theme-synthwave"],
  "catppuccin-mocha": ["dark", "theme-catppuccin-mocha"],
  "catppuccin-macchiato": ["dark", "theme-catppuccin-macchiato"],
  "catppuccin-frappe": ["dark", "theme-catppuccin-frappe"],
  "catppuccin-latte": ["theme-catppuccin-latte"], // Light theme, no "dark" class
  "yin-yang": ["dark", "theme-yin-yang"],
  "yang-yin": ["theme-yang-yin"], // Light theme, no "dark" class
};

const allThemeClasses = [
  "dark",
  "theme-tokyo-night",
  "theme-tokyo-storm",
  "theme-tokyo-moon",
  "theme-tokyo-day",
  "theme-synthwave",
  "theme-catppuccin-mocha",
  "theme-catppuccin-macchiato",
  "theme-catppuccin-frappe",
  "theme-catppuccin-latte",
  "theme-yin-yang",
  "theme-yang-yin",
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes first
    allThemeClasses.forEach((cls) => root.classList.remove(cls));

    // Apply the new theme classes
    const classes = themeClasses[theme] || themeClasses.default;
    classes.forEach((cls) => root.classList.add(cls));
  }, [theme]);

  return <>{children}</>;
}
