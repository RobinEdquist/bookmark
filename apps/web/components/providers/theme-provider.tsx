"use client";

import { useEffect } from "react";
import { useTheme } from "../../lib/use-theme";
import { themeClasses, allThemeClasses } from "../../lib/theme-config";

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
